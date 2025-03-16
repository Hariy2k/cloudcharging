import supertest from "supertest";
import { buildApp } from "./app";
import { performance } from "perf_hooks";

const app = supertest(buildApp());
const TEST_ACCOUNT = "test_account";
const INITIAL_BALANCE = 100;
const CHARGE_AMOUNT = 10;

async function resetAccount() {
    await app.post("/reset").send({ account: TEST_ACCOUNT }).expect(204);
}

async function chargeAccount() {
    return app.post("/charge")
        .send({ account: TEST_ACCOUNT, charges: CHARGE_AMOUNT })
        .expect(200);
}

async function runConcurrentTest(numRequests: number) {
    // Reset account to initial state
    await resetAccount();
    
    console.log(`Starting concurrent test with ${numRequests} requests...`);
    const start = performance.now();
    
    // Create array of concurrent charge requests
    const requests = Array(numRequests).fill(null).map(() => chargeAccount());
    
    // Wait for all requests to complete
    const results = await Promise.all(requests);
    
    const duration = performance.now() - start;
    console.log(`Completed ${numRequests} requests in ${duration.toFixed(2)}ms`);
    console.log(`Average latency: ${(duration / numRequests).toFixed(2)}ms per request`);
    
    // Verify results
    const successfulCharges = results.filter(r => r.body.isAuthorized).length;
    const expectedCharges = Math.floor(INITIAL_BALANCE / CHARGE_AMOUNT);
    
    console.log(`Successful charges: ${successfulCharges}`);
    console.log(`Expected successful charges: ${expectedCharges}`);
    console.log(`Final balance: ${results[results.length - 1].body.remainingBalance}`);
    
    // Verify no negative balance
    const hasNegativeBalance = results.some(r => r.body.remainingBalance < 0);
    console.log(`Negative balance detected: ${hasNegativeBalance}`);
    
    return {
        duration,
        successfulCharges,
        expectedCharges,
        hasNegativeBalance,
        finalBalance: results[results.length - 1].body.remainingBalance
    };
}

async function runTests() {
    try {
        // Test with different concurrent loads
        await runConcurrentTest(5);  // Light load
        await runConcurrentTest(10); // Medium load
        await runConcurrentTest(20); // Heavy load
    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

runTests(); 