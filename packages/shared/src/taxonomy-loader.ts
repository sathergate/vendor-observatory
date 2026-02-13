import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { VendorTaxonomy } from "./types.js";

/**
 * Load a VendorTaxonomy from a YAML file on disk.
 */
export function loadVendorTaxonomy(filePath: string): VendorTaxonomy {
  const raw = readFileSync(filePath, "utf-8");
  const data = parseYaml(raw) as VendorTaxonomy;
  return data;
}
