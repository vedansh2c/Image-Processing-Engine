import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync } from "node:fs";
// Deterministic RGBA fixture; algorithms under test still run only in C++.
function fixture() {
  const w = 640,
    h = 480,
    raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const mountain = y > h * 0.8 - Math.abs(x - w * 0.55) * 0.6;
      const circle = (x - 180) ** 2 + (y - 135) ** 2 < 55 ** 2;
      const values = circle
        ? [240, 215, 134]
        : mountain
          ? [42, 61, 65]
          : [
              Math.round(90 + (110 * y) / h),
              Math.round(122 + (70 * y) / h),
              Math.round(154 + (30 * y) / h),
            ];
      raw[i] = values[0];
      raw[i + 1] = values[1];
      raw[i + 2] = values[2];
      raw[i + 3] = 255;
    }
  function crc(buffer: Buffer) {
    let c = 0xffffffff;
    for (const b of buffer) {
      c ^= b;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer) {
    const kind = Buffer.from(type),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([kind, data])));
    return Buffer.concat([size, kind, data, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const upload = {
  name: "synthetic-landscape.png",
  mimeType: "image/png",
  buffer: fixture(),
};

test("upload, all filters, mode comparison, slider and native PNG download", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Image Processing Engine — Native image processing");
  await expect(page.getByText("Native engine online")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeDisabled();
  await page.locator("input[type=file]").setInputFiles(upload);
  await expect(page.getByAltText("Original upload")).toBeVisible();
  await page.getByRole("radio", { name: "sequential", exact: true }).check();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await expect(page.getByAltText("Processed image")).toBeVisible();
  await page.getByRole("radio", { name: "optimized", exact: true }).check();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      "Single-run comparison; use the lab for repeated measurements.",
    ),
  ).toBeVisible();
  await page.getByLabel("Before and after comparison").fill("35");
  await expect(page.getByLabel("Before and after comparison")).toHaveValue(
    "35",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Fit image", exact: true }).click();
  mkdirSync("../docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "../docs/screenshots/workspace.png",
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  expect(await file.failure()).toBeNull();
  const pngBytes = readFileSync((await file.path())!);
  expect(pngBytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pngBytes.readUInt32BE(16)).toBe(640);
  for (const filter of [
    "grayscale",
    "adjust",
    "sobel",
    "sharpen",
    "resize",
    "invert",
  ]) {
    await page.getByLabel("Filter", { exact: true }).selectOption(filter);
    if (filter === "resize") {
      await page.getByLabel("Output width").fill("320");
      await page.getByLabel("Output height").fill("240");
    }
    await page
      .getByRole("button", { name: "Process image", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Process image", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("radio", { name: "multithreaded", exact: true }).check();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  // A valid JPEG encoded by the browser exercises the native JPEG decoder.
  const jpeg = await page.evaluate(() => {
    const source = document.querySelector<HTMLImageElement>(
      'img[alt="Original upload"]',
    )!;
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    canvas.getContext("2d")!.drawImage(source, 0, 0);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await expect(page.getByAltText("Original upload")).toBeVisible();
  await expect(page.getByText("synthetic.jpg", { exact: true })).toBeVisible();
  const jpegResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/process") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  expect((await (await jpegResponse).json()).channels).toBe(3);
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reset workspace" }).click();
  await expect(page.getByAltText("Processed image")).toHaveCount(0);
});

test("benchmark charts and JSON export contain real native measurements", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Image Processing Engine — Native image processing");
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  await page.getByLabel("Algorithm", { exact: true }).selectOption("invert");
  await page.getByLabel("Measured iterations").fill("3");
  await page.getByLabel("Worker counts", { exact: true }).fill("1, 2");
  await page.getByLabel("1280 × 720").check();
  await page
    .getByRole("button", { name: "Run benchmark", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Measured results", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.screenshot({
    path: "../docs/screenshots/benchmarks.png",
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export results", exact: true })
    .click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("image-processing-engine-benchmark.json");
  const exported = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(exported.results).toHaveLength(10);
  expect(
    exported.results.every(
      (row: { latency_ms: number; checksum: string }) =>
        row.latency_ms > 0 && typeof row.checksum === "string",
    ),
  ).toBe(true);
});

test("mobile layout, validation and processing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle("Image Processing Engine — Native image processing");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await page.locator("input[type=file]").setInputFiles(upload);
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await expect(page.getByAltText("Processed image")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Benchmarks", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
