
const PAYOS_CLIENT_ID = "3fb1a514-5bea-4af3-97ef-95b7f6d9d50a";
const PAYOS_API_KEY = "7b990b90-d425-4b9c-8584-914e4ccd760c";
const PAYOS_CHECKSUM_KEY = "160d919d7a76953d3226e157a67af11a51207449965703f33232ba8e24abe49c";

/**
 * Generates HMAC SHA256 signature for PayOS
 * In a real production environment, this MUST happen on a secure backend.
 */
async function generateSignature(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', 
    keyData, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const createPaymentLink = async (order: {
  amount: number;
  description: string;
  orderCode: number;
  returnUrl: string;
  cancelUrl: string;
}) => {
  // Sort keys alphabetically as required by PayOS for signature
  const signatureData = `amount=${order.amount}&cancelUrl=${order.cancelUrl}&description=${order.description}&orderCode=${order.orderCode}&returnUrl=${order.returnUrl}`;
  const signature = await generateSignature(signatureData, PAYOS_CHECKSUM_KEY);

  const payload = {
    ...order,
    signature
  };

  try {
    // Note: Frontend calls to PayOS might be blocked by CORS unless handled by a proxy.
    // In this developer environment, we simulate the redirect if CORS fails, 
    // but the code below is the correct integration with credentials.
    const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": PAYOS_CLIENT_ID,
        "x-api-key": PAYOS_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.code === "00") {
      return result.data.checkoutUrl;
    } else {
      throw new Error(result.desc || "Failed to create payment link");
    }
  } catch (error) {
    console.error("PayOS Error:", error);
    // For demo purposes, we fallback to a simulated success URL if API is unreachable due to CORS
    // alert("Payment API call blocked by CORS. Redirecting to simulated checkout...");
    // return `https://pay.payos.vn/checkout/${order.orderCode}`; 
    throw error;
  }
};
