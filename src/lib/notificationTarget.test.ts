import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notificationTarget";

describe("notificationTarget", () => {
  it("opens the exact agenda event, including old agenda labels", () => {
    expect(notificationTarget({ link_tab: "agenda", link_id: "event-id" })).toEqual({ kind: "event", id: "event-id" });
    expect(notificationTarget({ link_tab: "calendar", link_id: null })).toEqual({ kind: "tab", tab: "calendar" });
  });

  it("opens the exact process and falls back to its section for old notices", () => {
    expect(notificationTarget({ link_tab: "cases", link_id: "case-id" })).toEqual({ kind: "case", id: "case-id" });
    expect(notificationTarget({ link_tab: "cases", link_id: null })).toEqual({ kind: "tab", tab: "cases" });
  });

  it("keeps other destinations and ignores unknown values", () => {
    expect(notificationTarget({ link_tab: "publications", link_id: null })).toEqual({ kind: "tab", tab: "publications" });
    expect(notificationTarget({ link_tab: "unknown", link_id: "case-id" })).toBeNull();
  });
});
