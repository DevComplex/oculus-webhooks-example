import { Context, Router, ServerSentEvent, ServerSentEventTarget } from "oak";

import { createHmac } from "https://deno.land/std@0.166.0/node/crypto.ts";


function validateSignature(payload: string, signature: string, appSecret: string): boolean {
    const serializedPayload = new TextEncoder().encode(payload);
    const hmac = createHmac("sha1", new TextEncoder().encode(appSecret));
    hmac.update(serializedPayload);
    const generatedSignature = hmac.toString();
    return signature === generatedSignature;
}

export const router = new Router();

const APP_SECRET = Deno.env.get("APP_SECRET");
const SSE_ENDPOINT = "/sse";
const EVENTS_ENDPOINT = "/events";
const EVENTS_TOPIC = "events";
const EXPECTED_VERIFY_TOKEN = "TEST_VERIFY_TOKEN";
const SUBSCRIBE_MODE = "subscribe";

class EventHistory {
    events: string[] = [];
    maxSize: number;

    constructor(maxSize: number = 1000) {
        this.events = [];
        this.maxSize = maxSize;
    }

    addEvent(event: string) {
        if (this.events.length >= this.maxSize) {
            this.events.shift();
        }
        this.events.push(event);
    }

    isEmpty() {
        return this.events.length === 0;
    }

    get getEvents(): string[] {
        return this.events;
    }
}

const channel = new BroadcastChannel(EVENTS_TOPIC);
const eventHistory = new EventHistory();
const clientTargets = new Set<ServerSentEventTarget>();

router.get("/", (ctx: Context) => {
    function getSSEClientHTML()  {
        return `<html>
        <body>
          <h1>Meta Quest Webhooks Events</h1>
          <pre id="events"></pre>

          <script>
            const events = document.getElementById("events");
            const write = (msg) => events.append(msg + "\\n");
            const source = new EventSource("${SSE_ENDPOINT}");
            source.addEventListener("${EVENTS_TOPIC}", (evt) => {
                write(evt.data);
            });
          </script>
        </body>
      </html>`;
    }

    const body = new TextEncoder().encode(getSSEClientHTML());
    ctx.response.type = "text/html";
    ctx.response.body = body;
    ctx.response.status = 200;
});


channel.onmessage = (evt) => {
    eventHistory.addEvent(evt.data);
    const event = createServerSentEvent(EVENTS_TOPIC, evt.data);
    for(const target of clientTargets) {
        target.dispatchEvent(event);
    }
}

function wait(timeInMs: number) {
    return new Promise(resolve => setTimeout(resolve, timeInMs));
}

async function dispatchHistoricalEvents(target: ServerSentEventTarget, delayTimeInMs: number = 150) {
    for(const eventStr of eventHistory.events) {
        const event = createServerSentEvent(EVENTS_TOPIC, eventStr);
        await wait(delayTimeInMs);
        if (clientTargets.has(target)) {
            target.dispatchEvent(event);
        } else {
            return;
        }
    }
}

router.get(SSE_ENDPOINT, (ctx: Context) => {
    const target = ctx.sendEvents();
    clientTargets.add(target)
    if (!eventHistory.isEmpty()) {
        dispatchHistoricalEvents(target);
    }
    target.addEventListener("close", () => {
        clientTargets.delete(target);
    });
});

router.get(EVENTS_ENDPOINT, (ctx: Context) => {
    const mode = ctx.request.url.searchParams.get("hub.mode");
    const challenge = ctx.request.url.searchParams.get("hub.challenge");
    const verifyToken = ctx.request.url.searchParams.get("hub.verify_token");

    if (mode === SUBSCRIBE_MODE && challenge && EXPECTED_VERIFY_TOKEN === verifyToken) {
        ctx.response.status = 200;
        ctx.response.type = "text/plain";
        ctx.response.body = challenge;
    } else {
        ctx.response.status = 400;
    }
});

function createServerSentEvent(topic: string, data: string) {
    return new ServerSentEvent(topic, { data });
}

router.post(EVENTS_ENDPOINT, async (ctx) => {
  const { value } = ctx.request.body({ type: "json" });

  const data = JSON.stringify(await value);
  console.log(`Request with payload... ${data}`);

  const signature = ctx.request.headers.get("x-hub-signature");
  const signatureValue = signature?.split("sha1=")[1];

  if (!validateSignature(data, signatureValue!, APP_SECRET!)) {
    console.log("Invalid signature... Request did not come from Meta...");
  }

  channel.postMessage(data);
  eventHistory.addEvent(data);

  for(const target of clientTargets) {
      const event = createServerSentEvent(EVENTS_TOPIC, data);
      target.dispatchEvent(event);
  }

  try {
    ctx.response.status = 200;
    ctx.response.body = { isSuccessful: true };
  } catch {
    ctx.throw(500);
  }
});
