/** Ephemeral SMTP capture fixture used only by the disposable full-stack CI.
 *
 * Implements just enough SMTP to exercise Django's *real network SMTP backend*
 * without accepting mail from outside loopback or delivering email externally.
 * Emails stay in memory and are never written to CI artifacts or logs.
 */
import { createServer } from "node:net";

const MAX_MESSAGE_BYTES = 128 * 1024;

export async function startSmtpSink(port = 1025) {
  const messages = [];
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.write("220 localhost isolated owner authentication fixture\r\n");
    let buffer = "";
    let data = null;
    let sender = null;
    let recipients = [];

    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());

    socket.on("data", chunk => {
      buffer += chunk;
      if (buffer.length > MAX_MESSAGE_BYTES) {
        socket.end("552 message size exceeded\r\n");
        return;
      }
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n");
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);

        if (data !== null) {
          if (line === ".") {
            if (sender && recipients.length && data.length <= MAX_MESSAGE_BYTES) {
              messages.push({ sender, recipients: [...recipients], body: data.join("\r\n") });
              socket.write("250 2.0.0 queued by isolated fixture\r\n");
            } else {
              socket.write("554 invalid message\r\n");
            }
            data = null;
            sender = null;
            recipients = [];
          } else {
            data.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }

        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO" || command === "HELO") {
          socket.write("250-localhost\r\n250 SIZE 131072\r\n");
        } else if (command === "MAIL" && /^MAIL FROM:/i.test(line)) {
          sender = line.replace(/^MAIL FROM:\s*/i, "").trim();
          socket.write("250 sender accepted\r\n");
        } else if (command === "RCPT" && /^RCPT TO:/i.test(line)) {
          recipients.push(line.replace(/^RCPT TO:\s*/i, "").trim());
          socket.write("250 recipient accepted\r\n");
        } else if (command === "DATA" && sender && recipients.length) {
          data = [];
          socket.write("354 end with CRLF dot CRLF\r\n");
        } else if (command === "RSET") {
          sender = null;
          recipients = [];
          data = null;
          socket.write("250 reset\r\n");
        } else if (command === "NOOP") {
          socket.write("250 ok\r\n");
        } else if (command === "QUIT") {
          socket.end("221 bye\r\n");
          return;
        } else {
          socket.write("503 bad sequence\r\n");
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    messages,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
