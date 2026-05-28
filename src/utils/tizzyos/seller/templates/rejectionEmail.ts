export const generateRejectionEmailHTML = (name: string): string => {
  return `
    <div style="font-family: sans-serif; text-align: center;">
      <h2>Hello, ${name}</h2>
      <p>We regret to inform you that your Seller Application has been <strong style="color: red;">rejected</strong>.</p>
      <p>This could be due to:</p>
      <ul style="text-align: left; max-width: 500px; margin: auto;">
        <li>Missing or invalid Aadhaar/PAN documents</li>
        <li>Unclear selfie verification</li>
        <li>Incomplete details in your application</li>
      </ul>
      <p style="margin-top: 20px;">You can try reapplying by submitting valid documents.</p>
      <p style="font-size: 12px; color: gray;">
        If you believe this was a mistake, please contact support.
      </p>
    </div>
  `;
};
