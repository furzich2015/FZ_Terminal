import { describe, expect, it } from "vitest";
import type { RemoteConnection } from "../types";
import {
  connectionsMatch,
  detectTerminalDirectory,
  selectFileTerminalCandidate,
} from "./terminalContext";

const connection: RemoteConnection = {
  id: "server-one",
  name: "Server one",
  host: "example.internal",
  user: "root",
  port: 2222,
  rootPath: "~",
  workspaceIds: [],
  source: "manual",
};

describe("terminal context", () => {
  it("matches only the intended SSH host, user, and port", () => {
    expect(
      connectionsMatch(connection, {
        host: "EXAMPLE.internal",
        user: "root",
        port: 2222,
        identityFile: "/opt/fz-test/server-key",
      }),
    ).toBe(true);
    expect(
      connectionsMatch(connection, {
        host: "example.internal",
        user: "deploy",
        port: 2222,
      }),
    ).toBe(false);
    expect(
      connectionsMatch(connection, {
        host: "other.internal",
        user: "root",
        port: 2222,
      }),
    ).toBe(false);
  });

  it("reads the current directory from common local and SSH prompts", () => {
    expect(
      detectTerminalDirectory(["root@server:/etc/netplan# "]),
    ).toBe("/etc/netplan");
    expect(
      detectTerminalDirectory(["[deploy@server /srv/app]$ npm test"]),
    ).toBe("/srv/app");
    expect(detectTerminalDirectory([], "root@server: /var/log")).toBe(
      "/var/log",
    );
  });

  it("routes local actions locally and remote actions to the correct server", () => {
    const candidates = [
      {
        id: "wrong-remote",
        context: {
          remote: true,
          verified: true,
          multiplexer: null,
          connection: { host: "other.internal", user: "root", port: 2222 },
        },
      },
      {
        id: "local",
        context: { remote: false, multiplexer: null },
      },
      {
        id: "correct-remote",
        context: {
          remote: true,
          verified: true,
          multiplexer: null,
          connection: {
            host: "example.internal",
            user: "root",
            port: 2222,
          },
        },
      },
    ];

    expect(selectFileTerminalCandidate(candidates)?.id).toBe("local");
    expect(selectFileTerminalCandidate(candidates, connection)?.id).toBe(
      "correct-remote",
    );
    expect(
      selectFileTerminalCandidate(
        [
          {
            ...candidates[2],
            context: { ...candidates[2].context, verified: false },
          },
          candidates[1],
        ],
        connection,
      )?.id,
    ).toBe("local");
  });
});
