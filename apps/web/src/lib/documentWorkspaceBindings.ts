export function documentWorkspaceSolutionCopyHandler<THandler>(supported: boolean, handler: THandler): THandler | undefined {
  return supported ? handler : undefined;
}

export function documentWorkspaceVoidAction(action: () => void | Promise<unknown>) {
  return () => {
    void action();
  };
}
