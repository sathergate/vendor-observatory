import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_TEMPLATE = `import { createHerald } from "notifykit";
// import { createTwilioProvider } from "notifykit/adapters/twilio";
// import { createResendProvider } from "notifykit/adapters/resend";

export const notifications = createHerald({
  providers: [
    // Uncomment and configure your providers:
    // createTwilioProvider({
    //   accountSid: process.env.TWILIO_ACCOUNT_SID!,
    //   authToken: process.env.TWILIO_AUTH_TOKEN!,
    //   from: process.env.TWILIO_FROM_NUMBER!,
    // }),
    // createResendProvider({
    //   apiKey: process.env.RESEND_API_KEY!,
    //   from: "noreply@yourdomain.com",
    // }),
  ],
  templates: {
    welcome: {
      channel: "email",
      subject: "Welcome to {{appName}}",
      body: "Hi {{name}}, thanks for signing up!",
    },
  },
});
`;

const TWILIO_UNCOMMENTED_TEMPLATE = `import { createHerald } from "notifykit";
import { createTwilioProvider } from "notifykit/adapters/twilio";
// import { createResendProvider } from "notifykit/adapters/resend";

export const notifications = createHerald({
  providers: [
    createTwilioProvider({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      from: process.env.TWILIO_FROM_NUMBER!,
    }),
    // createResendProvider({
    //   apiKey: process.env.RESEND_API_KEY!,
    //   from: "noreply@yourdomain.com",
    // }),
  ],
  templates: {
    welcome: {
      channel: "email",
      subject: "Welcome to {{appName}}",
      body: "Hi {{name}}, thanks for signing up!",
    },
  },
});
`;

const RESEND_UNCOMMENTED_TEMPLATE = `import { createHerald } from "notifykit";
// import { createTwilioProvider } from "notifykit/adapters/twilio";
import { createResendProvider } from "notifykit/adapters/resend";

export const notifications = createHerald({
  providers: [
    // Uncomment and configure your providers:
    // createTwilioProvider({
    //   accountSid: process.env.TWILIO_ACCOUNT_SID!,
    //   authToken: process.env.TWILIO_AUTH_TOKEN!,
    //   from: process.env.TWILIO_FROM_NUMBER!,
    // }),
    createResendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: "noreply@yourdomain.com",
    }),
  ],
  templates: {
    welcome: {
      channel: "email",
      subject: "Welcome to {{appName}}",
      body: "Hi {{name}}, thanks for signing up!",
    },
  },
});
`;

const BOTH_UNCOMMENTED_TEMPLATE = `import { createHerald } from "notifykit";
import { createTwilioProvider } from "notifykit/adapters/twilio";
import { createResendProvider } from "notifykit/adapters/resend";

export const notifications = createHerald({
  providers: [
    createTwilioProvider({
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      from: process.env.TWILIO_FROM_NUMBER!,
    }),
    createResendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: "noreply@yourdomain.com",
    }),
  ],
  templates: {
    welcome: {
      channel: "email",
      subject: "Welcome to {{appName}}",
      body: "Hi {{name}}, thanks for signing up!",
    },
  },
});
`;

function detectTwilio(): boolean {
  // Check env vars
  if (process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_FROM_NUMBER) {
    return true;
  }

  // Check package.json
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    if ("twilio" in allDeps) {
      return true;
    }
  } catch {
    // No package.json or invalid JSON — skip
  }

  return false;
}

function detectResend(): boolean {
  // Check env vars
  if (process.env.RESEND_API_KEY) {
    return true;
  }

  // Check package.json
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    if ("resend" in allDeps) {
      return true;
    }
  } catch {
    // No package.json or invalid JSON — skip
  }

  return false;
}

function getTemplate(hasTwilio: boolean, hasResend: boolean): string {
  if (hasTwilio && hasResend) return BOTH_UNCOMMENTED_TEMPLATE;
  if (hasTwilio) return TWILIO_UNCOMMENTED_TEMPLATE;
  if (hasResend) return RESEND_UNCOMMENTED_TEMPLATE;
  return CONFIG_TEMPLATE;
}

function commandInit(): void {
  const configPath = path.join(process.cwd(), "notifykit.config.ts");

  if (fs.existsSync(configPath)) {
    console.log("notifykit.config.ts already exists. Skipping.");
    return;
  }

  const hasTwilio = detectTwilio();
  const hasResend = detectResend();

  const template = getTemplate(hasTwilio, hasResend);
  fs.writeFileSync(configPath, template, "utf-8");

  console.log("Created notifykit.config.ts");

  if (hasTwilio) {
    console.log("  Detected Twilio — provider uncommented.");
  }
  if (hasResend) {
    console.log("  Detected Resend — provider uncommented.");
  }

  console.log("");
  console.log("Next steps:");
  console.log("  1. Open notifykit.config.ts and configure your providers");
  console.log("  2. Add your API keys to environment variables");
  console.log("  3. Import and use notifications in your app:");
  console.log("");
  console.log('     import { notifications } from "./herald.config";');
  console.log('     await notifications.send("welcome", {');
  console.log("       to: user.email,");
  console.log('       data: { name: user.name, appName: "MyApp" },');
  console.log("     });");
}

function commandTest(): void {
  console.log("To send a test notification:");
  console.log("");
  console.log("  1. Ensure notifykit.config.ts exists (run `herald init` first)");
  console.log("  2. Configure at least one provider with valid credentials");
  console.log("  3. Create a test script:");
  console.log("");
  console.log('     import { notifications } from "./herald.config";');
  console.log("");
  console.log('     await notifications.send("welcome", {');
  console.log('       to: "test@example.com",');
  console.log('       data: { name: "Test User", appName: "MyApp" },');
  console.log("     });");
  console.log("");
  console.log("  4. Run it with: npx tsx test-notification.ts");
}

function printHelp(): void {
  console.log("notifykit — Unified notifications for Next.js");
  console.log("");
  console.log("Usage:");
  console.log("  herald <command>");
  console.log("");
  console.log("Commands:");
  console.log("  init       Create a notifykit.config.ts in the current directory");
  console.log("  test       Print instructions for sending a test notification");
  console.log("");
  console.log("Options:");
  console.log("  --help     Show this help message");
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "init":
      commandInit();
      break;
    case "test":
      commandTest();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "notifykit --help" for usage.');
      process.exit(1);
  }
}

main();
