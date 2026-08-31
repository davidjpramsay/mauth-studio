import path from "node:path";

export function macosSidecarBuildPlan(root) {
  const outputRoot = path.join(root, "tmp", "macos");
  const workRoot = path.join(outputRoot, "pyinstaller-work");
  const specRoot = path.join(outputRoot, "pyinstaller-spec");
  const sidecarRoot = path.join(outputRoot, "mauth-api");
  const apiRoot = path.join(root, "apps", "api");

  return {
    cwd: apiRoot,
    outputRoot,
    workRoot,
    specRoot,
    sidecarRoot,
    executable: path.join(sidecarRoot, "mauth-api"),
    args: [
      "run",
      "pyinstaller",
      "--noconfirm",
      "--clean",
      "--onedir",
      "--name",
      "mauth-api",
      "--distpath",
      outputRoot,
      "--workpath",
      workRoot,
      "--specpath",
      specRoot,
      "--paths",
      apiRoot,
      "--paths",
      path.join(root, "packages", "question-engine"),
      "--paths",
      path.join(root, "packages", "formatting-engine"),
      "--paths",
      path.join(root, "packages", "marking-engine"),
      "--collect-submodules",
      "uvicorn",
      path.join(apiRoot, "app", "standalone.py"),
    ],
  };
}
