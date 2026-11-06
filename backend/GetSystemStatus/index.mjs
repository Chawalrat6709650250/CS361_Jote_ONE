import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        const command = new GetCommand({
            TableName: "SystemMetadata",
            Key: { id: "LATEST_SYNC" }
        });
        
        const response = await docClient.send(command);
        
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*", // อนุญาตให้หน้าเว็บ S3 ดึงข้อมูลได้ (CORS)
                "Content-Type": "application/json"
            },
            body: JSON.stringify(response.Item || { message: "ยังไม่มีประวัติการอัปเดต" }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }),
        };
    }
};