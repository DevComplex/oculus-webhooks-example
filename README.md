# Meta Mixed Reality Webhooks Example

This is an example of how a backend application could potentially integrate with Meta's Mixed Reality Webhooks system.

Of note is the GET **/events** endpoint which demonstrates how you would complete the webhook verification challenge.

What is not included is payload signature validation, which would be used to validate that the request is indeed coming from Meta. I'll implement this once I get a chance, but in the meantime how it works is that we sign all payloads with SHA1 signature and include the signature as a header **X-Hub-Signature**. You will need to use the configured App Secret in https://developer.oculus.com/manage/applications/<application-id> to validate it.

As to what the server is doing... It basically is just serving an HTML file with some javascript that sets up a [Server Sent Event](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) connection with the backend application. Whenever the backend recieves an event it will push that event to the frontend and render it as a beautiful JSON object.

Deployed using https://deno.com/deploy
