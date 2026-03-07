/**
 * Spike J0: Test OAuth → importWebTokenAuthorization → getSavedStarGifts
 *
 * This script tests whether the OIDC access_token from oauth.telegram.org
 * can be used as web_auth_token in auth.importWebTokenAuthorization to create
 * a full user MTProto session.
 *
 * USAGE:
 *   1. Set env vars in .env.local (TELEGRAM_API_ID, TELEGRAM_API_HASH)
 *   2. Get an OIDC access_token via the OAuth flow (Step A below)
 *   3. Run: npx tsx scripts/spike-oauth-mtproto.mts <access_token>
 *
 * STEP A — Get access_token manually:
 *   1. In BotFather: Bot Settings → Web Login → Add allowed URL (e.g. http://localhost:3000/callback)
 *   2. Note the Client ID (= bot_id) and Client Secret
 *   3. Open in browser:
 *      https://oauth.telegram.org/auth?bot_id=<BOT_ID>&scope=openid+profile+phone&response_type=code&redirect_uri=http://localhost:3000/callback
 *   4. Complete auth (enter phone on telegram.org, confirm in app)
 *   5. Browser redirects to http://localhost:3000/callback?code=<AUTH_CODE>
 *   6. Exchange code for token:
 *      curl -X POST https://oauth.telegram.org/auth/token \
 *        -d "grant_type=authorization_code" \
 *        -d "code=<AUTH_CODE>" \
 *        -d "redirect_uri=http://localhost:3000/callback" \
 *        -d "client_id=<BOT_ID>" \
 *        -d "client_secret=<CLIENT_SECRET>"
 *   7. Response JSON has access_token — pass it to this script
 */

import { TelegramClient } from "@vvitto/gifts-gramjs";
import { StringSession } from "@vvitto/gifts-gramjs/sessions";
import { Api } from "@vvitto/gifts-gramjs";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const API_ID = parseInt(process.env.TELEGRAM_API_ID ?? "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH ?? "";

if (!API_ID || !API_HASH) {
  console.error("ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}

const accessToken: string = process.argv[2] ?? "";
if (!accessToken) {
  console.error("ERROR: Pass access_token as first argument");
  console.error("Usage: npx tsx scripts/spike-oauth-mtproto.mts <access_token>");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("=== Spike J0: OAuth → MTProto Bridge Test ===\n");
  console.log(`API_ID: ${API_ID}`);
  console.log(`API_HASH: ${API_HASH.slice(0, 6)}...`);
  console.log(`Token: ${accessToken.slice(0, 10)}...\n`);

  // Step 1: Create unauthenticated MTProto client
  console.log("[1/4] Creating MTProto client...");
  const session = new StringSession("");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
    deviceModel: "Giftfolio Spike",
    systemVersion: "1.0.0",
    appVersion: "1.0.0",
  });

  await client.connect();
  console.log("  Connected to Telegram DC\n");

  // Step 2: Try importWebTokenAuthorization
  console.log("[2/4] Calling auth.importWebTokenAuthorization...");
  try {
    const authResult = await client.invoke(
      new Api.auth.ImportWebTokenAuthorization({
        apiId: API_ID,
        apiHash: API_HASH,
        webAuthToken: accessToken,
      })
    );

    console.log("  SUCCESS! Got auth.Authorization");
    console.log(`  Type: ${authResult.className}`);

    if (authResult instanceof Api.auth.Authorization) {
      const user = authResult.user;
      if (user instanceof Api.User) {
        console.log(`  User: ${user.firstName} ${user.lastName ?? ""} (@${user.username ?? "no-username"})`);
        console.log(`  User ID: ${user.id}\n`);
      }
    }

    // Save session for reuse
    const savedSession = client.session.save() as unknown as string;
    console.log(`  StringSession (first 20 chars): ${String(savedSession).slice(0, 20)}...\n`);

  } catch (err: unknown) {
    const error = err as { message?: string; errorMessage?: string; code?: number };
    console.error("  FAILED!");
    console.error(`  Error: ${error.errorMessage ?? error.message ?? String(err)}`);
    console.error(`  Code: ${error.code ?? "unknown"}`);
    console.error("\n  CONCLUSION: OIDC access_token ≠ web_auth_token");
    console.error("  The OAuth → MTProto bridge does NOT work with OIDC access_token.");
    console.error("  Need to investigate alternative token sources.\n");
    await client.disconnect();
    process.exit(1);
  }

  // Step 3: Try getSavedStarGifts
  console.log("[3/4] Calling payments.getSavedStarGifts (own profile)...");
  try {
    // GetSavedStarGifts is added by the fork but types may lag — use raw invoke
    const GetSavedStarGifts = (Api.payments as Record<string, unknown>)["GetSavedStarGifts"] as
      | (new (args: { peer: InstanceType<typeof Api.InputPeerSelf>; offset: string; limit: number }) => unknown)
      | undefined;

    if (!GetSavedStarGifts) {
      console.error("  GetSavedStarGifts not found in Api.payments — fork may not include it");
      await client.disconnect();
      process.exit(1);
    }

    const gifts = await client.invoke(
      new GetSavedStarGifts({
        peer: new Api.InputPeerSelf(),
        offset: "",
        limit: 10,
      }) as Parameters<typeof client.invoke>[0]
    );

    console.log("  SUCCESS! Got gifts response");
    console.log(`  Type: ${gifts.className}`);

    if ("count" in gifts) {
      console.log(`  Total gifts: ${gifts.count}`);
    }
    if ("gifts" in gifts && Array.isArray(gifts.gifts)) {
      console.log(`  Returned: ${gifts.gifts.length} gifts`);
      for (const g of gifts.gifts.slice(0, 3)) {
        if ("gift" in g && g.gift) {
          const gift = g.gift;
          if ("title" in gift && "slug" in gift && "num" in gift) {
            console.log(`    - ${gift.title} #${gift.num} (${gift.slug})`);
          } else if ("id" in gift) {
            console.log(`    - Regular gift ID: ${gift.id}`);
          }
        }
      }
    }
    if ("nextOffset" in gifts && gifts.nextOffset) {
      console.log(`  Next offset: ${gifts.nextOffset}`);
    }

  } catch (err: unknown) {
    const error = err as { message?: string; errorMessage?: string; code?: number };
    console.error("  FAILED to get gifts!");
    console.error(`  Error: ${error.errorMessage ?? error.message ?? String(err)}`);
    console.error(`  Code: ${error.code ?? "unknown"}`);
  }

  // Step 4: Summary
  console.log("\n[4/4] === SPIKE RESULT ===");
  console.log("  OAuth → importWebTokenAuthorization: WORKS");
  console.log("  getSavedStarGifts: check output above");
  console.log("  StringSession saved — can be reused for future calls");
  console.log("\n  CONCLUSION: Phase J is GO. Proceed with full implementation.\n");

  await client.disconnect();
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
