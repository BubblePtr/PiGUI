import * as sdk from "@earendil-works/pi-coding-agent";
import { createPublicPiSdkRuntimeFactory } from "../src/drivers/pi-sdk-runtime-adapter";
import { runPiSdkDriverSpike, type PiSdkSpikeReport } from "../src/drivers/pi-sdk-spike";

function payloadString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function messageSamples(report: PiSdkSpikeReport) {
  return report.events
    .map((event) => event.event)
    .filter((event) => event.payload.kind === "message")
    .slice(0, 12)
    .map((event) => ({
      seq: event.seq,
      role: payloadString(event.payload.role),
      messageId: payloadString(event.payload.messageId),
      bodyFormat: payloadString(event.payload.bodyFormat),
      phase: payloadString(event.payload.phase),
      body: payloadString(event.payload.body).slice(0, 120),
    }));
}

function cliReport(report: PiSdkSpikeReport) {
  const envelopes = report.events.map((event) => event.event);
  const seqs = envelopes.map((event) => event.seq);

  return {
    ok: report.ok,
    enabled: report.enabled,
    reason: report.reason,
    prompt: report.prompt,
    capabilities: report.capabilities,
    eventCount: envelopes.length,
    eventSeqRange: seqs.length
      ? {
          first: seqs[0],
          last: seqs[seqs.length - 1],
        }
      : null,
    messageSamples: messageSamples(report),
    snapshot: report.snapshot,
    error: report.error,
  };
}

const report = await runPiSdkDriverSpike({
  env: process.env,
  cwd: process.env.PIGUI_SDK_SPIKE_CWD ?? process.cwd(),
  runtimeFactory: createPublicPiSdkRuntimeFactory({ sdk }),
});

await new Promise<void>((resolve) => {
  process.stdout.write(`${JSON.stringify(cliReport(report), null, 2)}\n`, () => {
    resolve();
  });
});

process.exit(report.ok ? 0 : 1);
