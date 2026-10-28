import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// กำหนด Base URL ของทั้ง 2 หลักสูตร
const CURRICULUM_API_URLS = [
    "https://script.google.com/macros/s/AKfycbw75ktHQ9wrWMNcMBq1rd0OnNCi3OOJwwNS0kTT5OQDYGiBA1Up7B-Ufbhtu603HZcZ/exec", // หลักสูตร CS
    "https://script.google.com/macros/s/AKfycbxO0y-q5MC_dkvYOHwE5BguW0NYqBecLtF-JEvRJ42XnSouQ3Ij4-ss7paIYRX9wlU9SQ/exec"  // หลักสูตร CNC
];

const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

export const handler = async (event) => {
    try {
        console.log("=== เริ่มต้นซิงก์ข้อมูลหลักสูตรทั้งหมด (CS และ CNC) ===");

        for (const BASE_API_URL of CURRICULUM_API_URLS) {
            console.log(`กำลังดึงข้อมูลจาก API: ${BASE_API_URL}`);

            // 1. ดึงรายชื่อวิชาทั้งหมด
            const coursesRes = await fetch(`${BASE_API_URL}?resource=courses&limit=500`);
            const coursesJson = await coursesRes.json();
            
            if (!coursesJson.success) {
                console.warn(`ไม่สามารถดึงข้อมูลจาก ${BASE_API_URL} ได้ ข้ามไป...`);
                continue;
            }
            
            const courses = coursesJson.data?.courses || [];
            console.log(`พบรายวิชา: ${courses.length} รายการ กำลังประมวลผล...`);

            const courseBatches = chunkArray(courses, 5);

            for (let batchIndex = 0; batchIndex < courseBatches.length; batchIndex++) {
                const batch = courseBatches[batchIndex];

                await Promise.all(batch.map(async (item) => {
                    const courseCode = item.course_code;
                    const courseId = item.course_id || courseCode;
                    if (!courseCode) return;

                    // บันทึก CurriculumData
                    await docClient.send(new PutCommand({
                        TableName: "CurriculumData",
                        Item: { ...item, id: courseId }
                    }));

                    // ดึงข้อมูลย่อย
                    const [detailRes, ploRes, preRes] = await Promise.all([
                        fetch(`${BASE_API_URL}?resource=course&course_code=${encodeURIComponent(courseCode)}`).catch(() => null),
                        fetch(`${BASE_API_URL}?resource=course_plo_mappings&course_code=${encodeURIComponent(courseCode)}`).catch(() => null),
                        fetch(`${BASE_API_URL}?resource=prerequisites&course_code=${encodeURIComponent(courseCode)}`).catch(() => null)
                    ]);

                    if (detailRes) {
                        const detailJson = await detailRes.json().catch(() => ({}));
                        if (detailJson.success) {
                            await docClient.send(new PutCommand({
                                TableName: "CourseDetailData",
                                Item: { course_code: courseCode, detail: detailJson.data, updated_at: new Date().toISOString() }
                            }));
                        }
                    }

                    if (ploRes) {
                        const ploJson = await ploRes.json().catch(() => ({}));
                        if (ploJson.success) {
                            await docClient.send(new PutCommand({
                                TableName: "CourseMappingData",
                                Item: { 
                                    course_id: courseId, 
                                    course_code: courseCode,
                                    course_code_th: item.course_code_th || "",
                                    curriculum_id: item.curriculum_id || "",
                                    curriculum_course_id: item.curriculum_course_id || "",
                                    mappings: ploJson.data?.mappings || ploJson.data || [], 
                                    updated_at: new Date().toISOString() 
                                }
                            }));
                        }
                    }

                    if (preRes) {
                        const preJson = await preRes.json().catch(() => ({}));
                        if (preJson.success) {
                            await docClient.send(new PutCommand({
                                TableName: "CoursePrerequisitesData",
                                Item: { course_code: courseCode, prerequisites: preJson.data, updated_at: new Date().toISOString() }
                            }));
                        }
                    }
                }));
            }

            // 2. ดึงข้อมูลแผนการเรียนของหลักสูตรนี้
            const plansRes = await fetch(`${BASE_API_URL}?resource=study_plans`);
            const plansJson = await plansRes.json();
            const plans = plansJson.data?.study_plans || [];

            if (plans.length > 0) {
                await Promise.all(plans.map(async (plan) => {
                    const planId = plan.study_plan_id;
                    if (!planId) return;

                    const planDetailRes = await fetch(`${BASE_API_URL}?resource=study_plan&study_plan_id=${encodeURIComponent(planId)}`).catch(() => null);
                    const planDetailJson = planDetailRes ? await planDetailRes.json().catch(() => ({})) : {};

                    await docClient.send(new PutCommand({
                        TableName: "StudyPlansData",
                        Item: {
                            study_plan_id: planId,
                            summary: plan,
                            detail: planDetailJson.success ? planDetailJson.data : planDetailJson,
                            updated_at: new Date().toISOString()
                        }
                    }));
                }));
            }
        }

        console.log("ซิงก์ข้อมูลครบทุกหลักสูตร (CS และ CNC) เรียบร้อยแล้ว!");
        return { 
            statusCode: 200, 
            body: JSON.stringify({ success: true, message: "All curricula (CS & CNC) synced successfully!" }) 
        };

    } catch (error) {
        console.error("Error syncing curricula:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ success: false, error: error.message }) 
        };
    }
};