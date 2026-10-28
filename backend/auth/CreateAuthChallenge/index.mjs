export const handler = async (event) => {
  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
      // ส่งข้อความไปบอกฝั่ง Frontend (เผื่อเอาไปแสดงผล)
      event.response.publicChallengeParameters = {
          message: 'Please provide your TU password'
      };
      
      // ข้อมูลส่วนตัวของการ Challenge (ในที่นี้เราไม่ได้สร้าง OTP เลยใส่ค่าว่างไว้)
      event.response.privateChallengeParameters = {};
      
      // กำหนดชื่อ Metadata ให้รู้ว่านี่คือการเชื่อมกับ TU API
      event.response.challengeMetadata = 'TU_API_AUTH';
  }
  
  return event;
};