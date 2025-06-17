import * as dotenv from 'dotenv';

dotenv.config();

async function testGelatoAPI() {
  try {
    console.log("🔍 Testing Gelato Bundler API connection...");
    
    const apiKey = process.env.GELATO_API_KEY;
    if (!apiKey) {
      throw new Error("GELATO_API_KEY not found in environment variables");
    }
    
    const url = `https://api.gelato.digital/bundlers/11155111/rpc?sponsorApiKey=${apiKey}`;
    console.log("URL:", url.replace(apiKey, "***"));
    
    // Test eth_chainId using fetch
    console.log("\nCalling eth_chainId...");
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: []
      })
    });

    console.log("Response Status:", response.status);
    console.log("Response Headers:", Object.fromEntries(response.headers.entries()));
    
    const result = await response.json();
    console.log("Response Body:", JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("❌ API Error:", result.error);
      return;
    }

    if (result.result) {
      console.log("✅ Success!");
      console.log("Chain ID (hex):", result.result);
      console.log("Chain ID (decimal):", parseInt(result.result, 16));
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Execute the function
testGelatoAPI()
  .then(() => {
    console.log("\n✅ Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });