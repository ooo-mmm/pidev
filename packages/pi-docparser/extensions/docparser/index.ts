import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerDoctorCommand } from "./doctor.ts";
import { registerDocumentParseTool } from "./tool.ts";
import { registerDocumentSearchTool } from "./search-tool.ts";
import { registerDocumentScreenshotTool } from "./screenshot-tool.ts";

export default function parseDocumentExtension(pi: ExtensionAPI) {
  registerDocumentParseTool(pi);
  registerDocumentSearchTool(pi);
  registerDocumentScreenshotTool(pi);
  registerDoctorCommand(pi);
}
