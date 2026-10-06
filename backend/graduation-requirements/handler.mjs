import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
// ตั้งชื่อตารางจาก Environment Variable เพื่อไม่ผูกกับชื่อ table ใน source code
const tableName = process.env.GRADUATION_REQUIREMENTS_TABLE;

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(body),
});

/**
 * Lambda handler for:
 * GET /prod/api?resource=graduation_requirements
 *     &curriculum_id=BSC-CS-2566
 *     &pathway_id=BSC-CS-2566-ACS
 */
export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return response(204, {});
  }

  const params = event.queryStringParameters ?? {};
  const {
    resource,
    curriculum_id: curriculumId,
    pathway_id: pathwayId,
  } = params;

  if (resource !== "graduation_requirements") {
    return response(400, {
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: "resource must be graduation_requirements",
      },
    });
  }

  if (!curriculumId || !pathwayId) {
    return response(400, {
      success: false,
      error: {
        code: "MISSING_PARAMETER",
        message: "curriculum_id and pathway_id are required",
      },
    });
  }

  // ใช้ GetItem เพราะ curriculum_id และ pathway_id เป็นคีย์ของข้อมูลหนึ่งแผน
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        curriculum_id: curriculumId,
        pathway_id: pathwayId,
      },
    }),
  );

  if (!result.Item) {
    return response(404, {
      success: false,
      error: {
        code: "NOT_FOUND",
        message:
          "Graduation requirements were not found for this curriculum and pathway",
      },
    });
  }

  return response(200, {
    success: true,
    resource,
    data: result.Item,
  });
};
