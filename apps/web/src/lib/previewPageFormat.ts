import type { CSSProperties } from "react";
import type { FormattingConfig } from "@mauth-studio/shared";

export const A4_WIDTH_PX = 793.700787;
export const A4_HEIGHT_PX = 1122.519685;
export const DEFAULT_PAGE_FORMAT = {
  widthPx: A4_WIDTH_PX,
  heightPx: A4_HEIGHT_PX,
  paddingXPx: 76,
  paddingYPx: 76,
  showPageBreaks: true,
};

export type PageFormat = typeof DEFAULT_PAGE_FORMAT;

export function pageFormatFromConfig(formattingConfig?: FormattingConfig): PageFormat {
  const page = formattingConfig?.page;
  return {
    widthPx: page?.widthPx ?? DEFAULT_PAGE_FORMAT.widthPx,
    heightPx: page?.heightPx ?? DEFAULT_PAGE_FORMAT.heightPx,
    paddingXPx: page?.paddingXPx ?? DEFAULT_PAGE_FORMAT.paddingXPx,
    paddingYPx: page?.paddingYPx ?? DEFAULT_PAGE_FORMAT.paddingYPx,
    showPageBreaks: page?.showPageBreaks ?? DEFAULT_PAGE_FORMAT.showPageBreaks,
  };
}

export function pageStyle(pageFormat: PageFormat, scale = 1) {
  return {
    "--a4-page-width": `${pageFormat.widthPx}px`,
    "--a4-page-height": `${pageFormat.heightPx}px`,
    "--a4-page-padding-x": `${pageFormat.paddingXPx}px`,
    "--a4-page-padding-y": `${pageFormat.paddingYPx}px`,
    "--a4-preview-scale": String(scale),
    "--a4-preview-page-width": `${pageFormat.widthPx * scale}px`,
    "--a4-preview-page-height": `${pageFormat.heightPx * scale}px`,
    "--a4-preview-page-gap": `${16 * scale}px`,
  } as CSSProperties & Record<`--${string}`, string>;
}
