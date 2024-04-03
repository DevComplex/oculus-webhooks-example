import { resolve } from "https://deno.land/std@0.188.0/path/win32.ts";
import { Context, Router, ServerSentEvent, ServerSentEventTarget } from "oak";

export const router = new Router();

const SSE_ENDPOINT = "/sse";
const EVENTS_ENDPOINT = "/events";
const EVENTS_TOPIC = "events";
const EXPECTED_VERIFY_TOKEN = "TEST_VERIFY_TOKEN";
const SUBSCRIBE_MODE = "subscribe";

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

router.get("/", (ctx: Context) => {
    const body = new TextEncoder().encode(getSSEClientHTML());
    ctx.response.type = "text/html";
    ctx.response.body = body;
    ctx.response.status = 200;
});

const events: ServerSentEvent[] = []
const clientTargets = new Set<ServerSentEventTarget>();

function wait(timeInMs: number) {
    return new Promise(resolve => setTimeout(resolve, timeInMs));
}

async function dispatchEvents(target: ServerSentEventTarget, delayTimeInMs: number = 150) {
    for(const event of events) {
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
    if (events.length > 0) {
        dispatchEvents(target);
    }
    target.addEventListener("close", () => {
        clientTargets.delete(target);
    });
});

router.get(EVENTS_ENDPOINT, (ctx: Context) => {
    const mode = ctx.request.url.searchParams.get("mode");
    const challenge = ctx.request.url.searchParams.get("challenge");
    const verifyToken = ctx.request.url.searchParams.get("verify_token");

    if (mode === SUBSCRIBE_MODE && challenge && EXPECTED_VERIFY_TOKEN === verifyToken) {
        ctx.response.status = 200;
        ctx.response.type = "text/plain";
        ctx.response.body = challenge;
    } else {
        ctx.response.status = 400;
    }
});

router.post(EVENTS_ENDPOINT, async (ctx) => {
  const { value } = ctx.request.body({ type: "json" });
  const data = await value;
  const event = new ServerSentEvent(EVENTS_TOPIC, { data: JSON.stringify(data) });
  events.push(event);
  try {
    for(const target of clientTargets) {
        target.dispatchEvent(event);
    }
    ctx.response.status = 200;
    ctx.response.body = { isSuccessful: true };
  } catch {
    ctx.throw(500);
  }
});
