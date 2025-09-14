// src/socket-test-auto.js
// Usage:
//   node src/socket-test-auto.js <email> <password> <recipientId> [baseUrl]
// Example:
//   node src/socket-test-auto.js alice@example.com password123 68c6bbd86b1d1098da88a585 http://localhost:4000

const axios = require("axios");
const io = require("socket.io-client");

async function run() {
  const [, , email, password, recipientId, baseUrlArg] = process.argv;
  const baseUrl = baseUrlArg || "http://localhost:4000";

  if (!email || !password || !recipientId) {
    console.error(
      "Usage: node src/socket-test-auto.js <email> <password> <recipientId> [baseUrl]"
    );
    process.exit(1);
  }

  try {
    console.log("Logging in to obtain token...");
    const resp = await axios.post(
      `${baseUrl}/api/auth/login`,
      { email, password },
      { timeout: 5000 }
    );
    if (!resp.data || !resp.data.token) {
      console.error("Login response did not contain token:", resp.data);
      process.exit(2);
    }
    const token = resp.data.token;
    console.log(
      "Login successful — token received (masked):",
      token.slice(0, 20) + "..."
    );

    console.log("Connecting socket.io with token (auth handshake)...");
    const socket = io(baseUrl, {
      transports: ["websocket"],
      auth: { token },
      autoConnect: true,
      reconnectionAttempts: 0,
    });

    socket.on("connect", () => {
      console.log("Socket connected. id =", socket.id);
      console.log("Sending private_message to", recipientId);
      socket.emit(
        "private_message",
        { to: recipientId, text: "Hello from socket-test-auto" },
        (ack) => {
          console.log("ACK from server:", ack);
        }
      );
    });

    socket.on("connect_error", (err) => {
      console.error("connect_error ->", err && err.message ? err.message : err);
      console.error("full error object:", err);
      socket.close();
      process.exit(3);
    });

    socket.on("private_message", (d) =>
      console.log("private_message received:", JSON.stringify(d))
    );
    socket.on("user_online", (d) => console.log("user_online:", d));
    socket.on("typing", (d) => console.log("typing:", d));
    socket.on("server_test", (d) => console.log("server_test:", d));

    socket.on("disconnect", (reason) => {
      console.log("socket disconnected:", reason);
      process.exit(0);
    });

    // safety timeout
    setTimeout(() => {
      console.log("Timeout reached — closing socket.");
      socket.close();
      process.exit(0);
    }, 20000);
  } catch (err) {
    if (err.response) {
      console.error(
        "HTTP error during login:",
        err.response.status,
        err.response.data
      );
    } else {
      console.error("Error:", err.message || err);
    }
    process.exit(4);
  }
}

run();
