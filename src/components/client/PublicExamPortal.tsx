import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import type { ProvaTentativaDoc, TurmaPublicaDoc } from '../../types/domain.ts';
import {
  getPublicTurmaByToken,
  submitPublicProvaTentativa,
} from '../../services/operationalCrudService.ts';
import { SignaturePadCanvas } from './SignaturePadCanvas.tsx';

interface PublicExamPortalProps {
  tokenPublico: string;
  prefilledCpf?: string;
  prefilledNome?: string;
  prefilledColaboradorId?: string;
  onExit?: () => void;
}

function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

async function compressImageToDataUrl(file: Blob, maxWidth = 420): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Falha na leitura do arquivo.'));
    reader.readAsDataURL(file);
  });
}

export const PublicExamPortal: React.FC<PublicExamPortalProps> = ({
  tokenPublico,
  prefilledCpf = '',
  prefilledNome = '',
  prefilledColaboradorId = '',
  onExit,
}) => {
  const [turma, setTurma] = useState<TurmaPublicaDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Etapas: IDENTIFICACAO -> PROVA -> RESULTADO
  const [step, setStep] = useState<'IDENTIFICACAO' | 'PROVA' | 'RESULTADO'>('IDENTIFICACAO');

  // Identificação do colaborador
  const [nome, setNome] = useState(prefilledNome);
  const [cpf, setCpf] = useState(formatCpfInput(prefilledCpf));
  const [pin, setPin] = useState('');
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Prova & Assinatura
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [assinaturaDataUrl, setAssinaturaDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ProvaTentativaDoc | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void getPublicTurmaByToken(tokenPublico)
      .then((doc) => {
        if (!active) return;
        if (!doc) {
          setLoadError('Turma não encontrada ou link expirado.');
        } else {
          setTurma(doc);
        }
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Erro ao carregar a avaliação.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [tokenPublico]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setFormError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setFormError(
        'Câmera não disponível neste navegador. Use o botão "Enviar Foto / Selfie" logo abaixo.'
      );
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const w = 360;
    const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 360;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.72));
    stopCamera();
  };

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 380);
      setSelfieDataUrl(compressed);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao carregar foto.');
    }
  };

  const handleValidateIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!turma) return;

    if (turma.status !== 'ABERTA') {
      setFormError('Esta turma já foi encerrada e não aceita novas provas.');
      return;
    }

    if (nome.trim().length < 3) {
      setFormError('Informe seu nome completo.');
      return;
    }

    if (cpf.replace(/\D/g, '').length !== 11) {
      setFormError('Informe um CPF válido com 11 dígitos.');
      return;
    }

    if (turma.modoIdentificacao !== 'CPF') {
      if (turma.pinHash && pin.trim() !== turma.pinHash) {
        setFormError('PIN da turma incorreto. Confirme o código com o instrutor.');
        return;
      }
      if (!pin.trim()) {
        setFormError('Informe o PIN fornecido pelo instrutor.');
        return;
      }
    }

    if (turma.modoIdentificacao === 'CPF_PIN_SELFIE' && !selfieDataUrl) {
      setFormError('Capture ou envie uma selfie nítida para liberar a avaliação.');
      return;
    }

    stopCamera();
    setStep('PROVA');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turma) return;
    setFormError(null);

    const questoes = turma.questoesPublicas ?? [];
    const naoRespondidas = questoes.filter((q) => !respostas[q.id]);
    if (naoRespondidas.length > 0) {
      setFormError(
        `Responda todas as questões antes de finalizar (faltam ${naoRespondidas.length}).`
      );
      return;
    }

    if (!assinaturaDataUrl) {
      setFormError('Assine na tela com o dedo ou mouse antes de enviar a avaliação.');
      return;
    }

    setSubmitting(true);
    try {
      const colabId =
        prefilledColaboradorId || `cpf_${cpf.replace(/\D/g, '')}`;
      const attempt = await submitPublicProvaTentativa({
        turmaPublica: turma,
        colaboradorId: colabId,
        colaboradorNome: nome.trim(),
        colaboradorCpf: cpf.trim(),
        pinInformado: pin.trim() || undefined,
        respostas,
        assinaturaDataUrl,
        selfieDataUrl,
      });
      setResultado(attempt);
      setStep('RESULTADO');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao enviar avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  const brandColor = turma?.empresaCorPrimaria || '#0F172A';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Cabeçalho compacto mobile-first */}
      <header className="bg-white border-b border-slate-200 px-4 py-3.5 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {turma?.empresaLogoUrl ? (
              <img
                src={turma.empresaLogoUrl}
                alt={turma.empresaRazaoSocial}
                className="h-8 w-auto max-w-[100px] object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {turma?.nrCodigo?.slice(0, 4) || 'NR'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {turma?.empresaRazaoSocial || 'Avaliação de Treinamento'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {turma ? `${turma.nrCodigo} · ${turma.cargaHorariaHoras}h` : tokenPublico}
              </p>
            </div>
          </div>

          {onExit && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onExit();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8] mx-auto" />
            <p className="text-sm text-slate-600">Carregando avaliação da turma...</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3">
            <XCircle className="w-8 h-8 text-red-600 mx-auto" />
            <h1 className="text-base font-semibold text-slate-900">{loadError}</h1>
            <p className="text-xs text-slate-500">
              Verifique o link ou solicite um novo QR Code ao instrutor responsável.
            </p>
          </div>
        )}

        {turma && !loading && (
          <div className="space-y-5">
            {/* Banner da Turma */}
            <div
              className="rounded-2xl p-5 text-white"
              style={{ backgroundColor: brandColor }}
            >
              <p className="text-[11px] font-mono uppercase tracking-wider text-white/75">
                {turma.nrCodigo} · Nota mínima {turma.notaMinimaAprovacao}% · {turma.cargaHorariaHoras}h
              </p>
              <h1 className="mt-1 text-lg font-bold tracking-tight leading-snug">
                {turma.titulo}
              </h1>
              <p className="mt-1.5 text-xs text-white/80">
                Validação exigida:{' '}
                {turma.modoIdentificacao === 'CPF' && 'CPF do Colaborador'}
                {turma.modoIdentificacao === 'CPF_PIN' && 'CPF + PIN da Turma'}
                {turma.modoIdentificacao === 'CPF_PIN_SELFIE' && 'CPF + PIN + Selfie de Evidência'}
              </p>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-900">
                {formError}
              </div>
            )}

            {/* ETAPA 1: IDENTIFICAÇÃO */}
            {step === 'IDENTIFICACAO' && (
              <form
                onSubmit={handleValidateIdentity}
                className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
              >
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    1. Identificação do Colaborador
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Confirme seus dados para liberar a prova e registrar sua presença.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Carlos Eduardo Silva"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={cpf}
                    onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>

                {turma.modoIdentificacao !== 'CPF' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      PIN de acesso da turma
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Digite o PIN informado pelo instrutor"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                )}

                {turma.modoIdentificacao === 'CPF_PIN_SELFIE' && (
                  <div className="space-y-3 pt-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Selfie de validação de identidade
                    </label>

                    {selfieDataUrl ? (
                      <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <img
                          src={selfieDataUrl}
                          alt="Selfie capturada"
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-emerald-700">
                            Selfie registrada com sucesso
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelfieDataUrl(null)}
                            className="text-xs text-slate-500 underline mt-1 cursor-pointer"
                          >
                            Tirar novamente
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {cameraActive && (
                          <div className="rounded-xl overflow-hidden bg-slate-950 relative">
                            <video
                              ref={videoRef}
                              playsInline
                              muted
                              className="w-full h-56 object-cover"
                            />
                            <div className="p-3 flex justify-center gap-2 bg-slate-900">
                              <button
                                type="button"
                                onClick={captureFromCamera}
                                className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                              >
                                Capturar Foto
                              </button>
                              <button
                                type="button"
                                onClick={stopCamera}
                                className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void startCamera()}
                            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                            Abrir Câmera
                          </button>

                          <label className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
                            <Upload className="w-4 h-4" />
                            Enviar Foto / Selfie
                            <input
                              type="file"
                              accept="image/*"
                              capture="user"
                              onChange={(e) => void handleSelfieUpload(e)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Iniciar Avaliação
                </button>
              </form>
            )}

            {/* ETAPA 2: QUESTÕES + ASSINATURA NA TELA */}
            {step === 'PROVA' && (
              <form onSubmit={handleSubmitExam} className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        2. Questões da Avaliação
                      </h2>
                      <p className="text-xs text-slate-500">
                        Participante: {nome} · CPF {cpf}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-700">
                      {Object.keys(respostas).length}/{turma.questoesPublicas.length}
                    </span>
                  </div>

                  {turma.questoesPublicas.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                      Esta turma foi configurada para registro de presença e assinatura digital
                      sem questões objetivas adicionais. Assine abaixo para confirmar sua
                      participação.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {turma.questoesPublicas.map((q, idx) => (
                        <div key={q.id} className="space-y-2.5">
                          <p className="text-sm font-medium text-slate-900 leading-snug">
                            <span className="font-mono text-xs text-slate-400 mr-1.5">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            {q.enunciado}
                          </p>
                          <div className="space-y-1.5">
                            {q.alternativas.map((alt) => {
                              const selected = respostas[q.id] === alt.id;
                              return (
                                <button
                                  key={alt.id}
                                  type="button"
                                  onClick={() =>
                                    setRespostas((prev) => ({ ...prev, [q.id]: alt.id }))
                                  }
                                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors cursor-pointer flex items-start gap-2.5 ${
                                    selected
                                      ? 'border-[#1D4ED8] bg-blue-50/70 text-slate-900 font-medium'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-semibold shrink-0 mt-0.5 ${
                                      selected
                                        ? 'bg-[#1D4ED8] text-white'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {alt.id}
                                  </span>
                                  <span>{alt.texto}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assinatura Digital na Tela */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      3. Assinatura Digital do Colaborador
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sua assinatura será gravada como evidência e incorporada automaticamente ao
                      certificado.
                    </p>
                  </div>

                  <SignaturePadCanvas
                    value={assinaturaDataUrl}
                    onChange={setAssinaturaDataUrl}
                    height={160}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('IDENTIFICACAO')}
                    className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 px-5 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#1E40AF] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Enviando prova e assinatura...' : 'Finalizar e Enviar Prova'}
                  </button>
                </div>
              </form>
            )}

            {/* ETAPA 3: RESULTADO */}
            {step === 'RESULTADO' && resultado && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
                {resultado.status === 'APROVADO' ? (
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
                    <XCircle className="w-8 h-8" />
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {resultado.status === 'APROVADO'
                      ? 'Avaliação concluída — Aprovado'
                      : 'Avaliação concluída — Nota abaixo do mínimo'}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {resultado.colaboradorNome} · CPF {resultado.colaboradorCpf}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div>
                    <p className="text-[11px] text-slate-500">Nota Final</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {resultado.notaPercentual}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Acertos</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {resultado.acertos ?? 0}/{resultado.totalQuestoes ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Mínimo</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {turma.notaMinimaAprovacao}%
                    </p>
                  </div>
                </div>

                {resultado.assinaturaDataUrl && (
                  <div className="text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <p className="text-[11px] text-slate-500 mb-1.5">
                      Assinatura digital registrada com sucesso
                    </p>
                    <img
                      src={resultado.assinaturaDataUrl}
                      alt="Assinatura registrada"
                      className="h-14 object-contain"
                    />
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    Evidência salva no painel de {turma.empresaRazaoSocial}
                  </div>
                </div>

                {onExit && (
                  <button
                    type="button"
                    onClick={onExit}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
                  >
                    Retornar ao Painel da Turma (ver evidência registrada)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
