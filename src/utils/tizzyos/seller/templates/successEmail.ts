export const generateSuccessEmailHTML = (name: string, uniqOsId: string): string => {
  return `
    <div style="font-family: sans-serif; text-align: center;">
      <h2>Welcome, ${name}!</h2>
      <p>Your UniqOS ID has been generated:</p>
      <img src="https://dummyimage.com/600x200/000/fff&text=${uniqOsId}" alt="UniqOS ID" />
      <div style="margin-top: 20px;">
        <button style="padding: 10px 20px; background-color: green; color: white;">Show ID</button>
        <button style="padding: 10px 20px; background-color: gray; color: white;">Close</button>
      </div>
      <h3>App Features:</h3>
      <ul>
        <li>Easy onboarding</li>
        <li>Document verification</li>
        <li>Realtime notifications</li>
      </ul>
      <p style="font-size: 12px; color: gray;">
        By submitting your application, you agree to our terms and privacy policy.
      </p>
      <p style="color: red;"><strong>Do not share this UniqOS ID.</strong></p>
    </div>
  `;
};
