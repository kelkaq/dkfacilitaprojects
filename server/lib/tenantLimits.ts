type LimitPlan = {
  limiteUsuarios: number;
  limiteColaboradores: number;
  limiteObras: number;
  adicionais?: Array<{ quantidade: number; adicional: { recursoChave: string; incrementoQtd: number } }>;
};

export function effectiveTenantLimits(plan: LimitPlan) {
  const extra = (key: string) => (plan.adicionais ?? [])
    .filter((item) => item.adicional.recursoChave === key)
    .reduce((sum, item) => sum + item.quantidade * item.adicional.incrementoQtd, 0);
  return {
    limiteUsuarios: plan.limiteUsuarios + extra('usuarios_extra'),
    limiteColaboradores: plan.limiteColaboradores + extra('colaboradores_extra'),
    limiteObras: plan.limiteObras,
  };
}
