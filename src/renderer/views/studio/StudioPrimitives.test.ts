// @vitest-environment jsdom
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioModal, StudioSegmented } from "./StudioPrimitives";

describe("Studio primitives", () => {
  it("changes segmented navigation through accessible buttons", () => {
    const onChange = vi.fn();
    render(createElement(StudioSegmented, {
      value: "one",
      label: "View",
      options: [
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
      ],
      onChange,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(onChange).toHaveBeenCalledWith("two");
    expect(screen.getByRole("button", { name: "One" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("closes a modal through its named close control", () => {
    const onClose = vi.fn();
    render(createElement(StudioModal, {
      title: "Edit",
      onClose,
      children: createElement("p", null, "Body"),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
