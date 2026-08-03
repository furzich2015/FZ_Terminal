import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DetectedRemoteConnection } from "../src/types";

const require = createRequire(import.meta.url);
const sshContext = require("./ssh-context.cjs") as {
  analyzeSshCommand: (
    command: string,
    workingDirectory: string,
  ) => { connection: DetectedRemoteConnection } | undefined;
  parseSshConnection: (
    args: string[],
    workingDirectory: string,
  ) => DetectedRemoteConnection | undefined;
  resolveRemoteCompletionDirectory: (
    currentDirectory?: string,
    requestedDirectory?: string,
  ) => string;
};

describe("SSH process context", () => {
  it("retains the identity file used by the terminal SSH process", () => {
    expect(
      sshContext.parseSshConnection(
        [
          "/usr/bin/ssh",
          "-i",
          "keys/production",
          "-p",
          "2222",
          "root@example.internal",
        ],
        "/srv/fz-test",
      ),
    ).toEqual({
      host: "example.internal",
      user: "root",
      port: 2222,
      identityFile: "/srv/fz-test/keys/production",
    });
    expect(
      sshContext.parseSshConnection(
        [
          "ssh",
          "-oIdentityFile=~/.ssh/deploy",
          "-oUser=deploy",
          "server-alias",
        ],
        "/tmp",
      )?.identityFile,
    ).toBe(path.join(os.homedir(), ".ssh/deploy"));
    expect(
      sshContext.analyzeSshCommand(
        "ssh -i keys/production -p 2222 root@example.internal",
        "/srv/fz-test",
      )?.connection,
    ).toEqual({
      host: "example.internal",
      user: "root",
      port: 2222,
      identityFile: "/srv/fz-test/keys/production",
    });
    expect(
      sshContext.analyzeSshCommand(
        "ssh '-t' '-p' '22' '-i' '/opt/fz keys/deploy' 'deploy@server' 'pwd'",
        "/tmp",
      )?.connection.identityFile,
    ).toBe("/opt/fz keys/deploy");
  });

  it("resolves completion paths against the current remote directory", () => {
    expect(
      sshContext.resolveRemoteCompletionDirectory("/etc/netplan", "../ssh/"),
    ).toBe("/etc/ssh/");
    expect(
      sshContext.resolveRemoteCompletionDirectory("/etc/netplan", "/var/log/"),
    ).toBe("/var/log/");
    expect(sshContext.resolveRemoteCompletionDirectory("/srv/app")).toBe(
      "/srv/app",
    );
  });
});
