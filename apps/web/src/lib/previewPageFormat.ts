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

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function fixedMillimetres(value: number) {
  return `${Number(value.toFixed(6))}mm`;
}

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
  const printMarginX = (pageFormat.paddingXPx / pageFormat.widthPx) * A4_WIDTH_MM;
  const printMarginY = (pageFormat.paddingYPx / pageFormat.heightPx) * A4_HEIGHT_MM;
  const printContentWidth = A4_WIDTH_MM - 2 * printMarginX;
  const printContentHeight = A4_HEIGHT_MM - 2 * printMarginY;
  return {
    "--a4-page-width": `${pageFormat.widthPx}px`,
    "--a4-page-height": `${pageFormat.heightPx}px`,
    "--a4-page-padding-x": `${pageFormat.paddingXPx}px`,
    "--a4-page-padding-y": `${pageFormat.paddingYPx}px`,
    "--a4-preview-scale": String(scale),
    "--a4-preview-page-width": `${pageFormat.widthPx * scale}px`,
    "--a4-preview-page-height": `${pageFormat.heightPx * scale}px`,
    "--a4-preview-page-gap": `${16 * scale}px`,
    "--a4-print-content-width": fixedMillimetres(printContentWidth),
    "--a4-print-content-height": fixedMillimetres(printContentHeight),
  } as CSSProperties & Record<`--${string}`, string>;
}

export function printPageRule(pageFormat: PageFormat) {
  const marginX = (pageFormat.paddingXPx / pageFormat.widthPx) * A4_WIDTH_MM;
  const marginY = (pageFormat.paddingYPx / pageFormat.heightPx) * A4_HEIGHT_MM;
  return `@page { size: A4; margin: ${fixedMillimetres(marginY)} ${fixedMillimetres(marginX)}; }`;
}
