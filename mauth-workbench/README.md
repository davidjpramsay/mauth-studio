# Mauth Workbench

This folder is for local Codex work products and other external/local AI scratch files that should not live in the Mauth Studio app source tree. It is safe to recreate locally and is intentionally separate from the app source tree.

The `.gitignore` in this folder keeps generated outputs out of Git by default, so the workbench stays disposable and local.

Use it for PDF-derived test builds, extracted page images, Canvas/QTI packages, conversion reports, temporary validation scripts, scratch data, and generated files for one-off tasks.

The migrated contents from the old app scratch folder are in:

```text
from-math-app-tmp/
```

If you are working with the app source tree on its own, create a sibling `mauth-workbench/` folder next to it or point your local agent scratch path somewhere outside the app tree.

Do not treat files here as app source unless they are deliberately promoted into `../math-app/` as app code, tests, docs, fixtures, or configuration.
