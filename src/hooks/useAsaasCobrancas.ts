import { useCallback, useEffect, useState } from 'react';
import { ASAAS_CHANGED_EVENT, lerConfig, listarCobrancas, type AsaasCharge } from '../services/asaasService';

const VIVAS = ['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];

/**
 * Cobranças do Asaas por título, para mostrar a etiqueta do boleto/Pix nas telas de contas a receber.
 * Se o Asaas não está ligado (ou o banco ainda não tem as tabelas), devolve `ativo: false` e nada muda na tela.
 */
export function useAsaasCobrancas() {
  const [ativo, setAtivo] = useState(false);
  const [porTitulo, setPorTitulo] = useState<Map<string, AsaasCharge>>(new Map());

  const carregar = useCallback(async () => {
    try {
      const cfg = await lerConfig();
      if (!cfg || !cfg.ativo) {
        setAtivo(false);
        setPorTitulo(new Map());
        return;
      }
      const lista = await listarCobrancas();
      const mapa = new Map<string, AsaasCharge>();
      // Uma cobrança viva por título (se houver só canceladas, mostra a mais recente)
      for (const c of lista) {
        const atual = mapa.get(c.title_id);
        if (!atual || (!VIVAS.includes(atual.status) && VIVAS.includes(c.status))) mapa.set(c.title_id, c);
      }
      setPorTitulo(mapa);
      setAtivo(true);
    } catch {
      setAtivo(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const aoMudar = () => void carregar();
    window.addEventListener(ASAAS_CHANGED_EVENT, aoMudar);
    return () => window.removeEventListener(ASAAS_CHANGED_EVENT, aoMudar);
  }, [carregar]);

  return { ativo, porTitulo, recarregar: carregar };
}
