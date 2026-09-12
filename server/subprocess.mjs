// An IPC supervisor stops only its own child if the service crashes or is killed.
import { spawn } from "node:child_process";
const [command, encodedArgs] = process.argv.slice(2);
let child;
let stopping = false;
let timer;
function stop() {
  if (stopping) return;
  stopping = true;
  if (!child) {
    process.exit(1);
    return;
  }
  child.kill("SIGTERM");
  timer = setTimeout(() => child.kill("SIGKILL"), 2000);
}
process.on("disconnect", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
  child = spawn(command, JSON.parse(encodedArgs), {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", (e) => {
    process.stderr.write(`Impossible de lancer ${command} : ${e.message}\n`);
    process.exit(127);
  });
  child.on("close", (code, signal) => {
    if (timer) clearTimeout(timer);
    process.exit(code ?? (signal ? 1 : 0));
  });
  if (!process.connected) stop();
} catch (e) {
  process.stderr.write(String(e) + "\n");
  process.exit(127);
}
