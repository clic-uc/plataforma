"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { IssueCloseReason, IssueType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/Badge";
import { Markdown } from "@/components/ui/Markdown";
import { MarkdownToolbar, useMarkdownEditor } from "@/components/ui/MarkdownToolbar";
import { CreateTaskModal } from "@/components/views/CreateTaskModal";
import { CreateFeatureModal } from "@/components/views/CreateFeatureModal";
import { IssueLinksPanel } from "@/components/views/IssueLinksPanel";
import { IssueTypeTag } from "@/components/views/ProjectIssuesList";
import { errorMessage } from "@/lib/api/http";
import { useProject } from "@/lib/api/projects";
import {
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_COMMENT_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  useCreateIssueComment,
  useDeleteIssue,
  useIssue,
  useSetIssueReviewed,
  useSetIssueStatus,
  useUpdateIssue,
  useUpdateIssueComment,
  type IssueComment,
} from "@/lib/api/issues";
import {
  ISSUE_CLOSE_REASON_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  issueCloseReasonLabel,
  issueStatusColor,
  issueStatusLabel,
} from "@/lib/api/status";

/** Ctrl+Enter (o Cmd+Enter) envía el formulario del textarea. */
function submitOnCtrlEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

function CommentItem({
  comment,
  saving,
  saveError,
  onSave,
}: {
  comment: IssueComment;
  saving: boolean;
  saveError: Error | null;
  onSave: (body: string, onDone: () => void) => void;
}) {
  // El borrador nace al pulsar "Editar", no al montar: así nunca arrastra un texto viejo.
  const [draft, setDraft] = useState<string | null>(null);
  const { textareaRef, format, onKeyDown } = useMarkdownEditor(draft ?? "", setDraft);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft?.trim()) onSave(draft, () => setDraft(null));
  }

  return (
    <div className="issue-c-item">
      <div className="issue-c-head">
        <span className="issue-c-author">{comment.author || "Ex miembro"}</span>
        <span className="issue-c-date">
          {comment.date}
          {comment.edited && " · editado"}
        </span>
        {comment.canEdit && draft === null && (
          <button type="button" className="doc-c-resolve" style={{ marginLeft: "auto" }} onClick={() => setDraft(comment.body)}>
            Editar
          </button>
        )}
      </div>
      {draft === null ? (
        <div className="issue-c-body">
          <Markdown>{comment.body}</Markdown>
        </div>
      ) : (
        <form className="doc-c-composer" onSubmit={handleSubmit}>
          <div className="md-frame">
            <MarkdownToolbar onFormat={format} />
            <textarea
              ref={textareaRef}
              autoFocus
              className="doc-c-input"
              value={draft}
              maxLength={MAX_ISSUE_COMMENT_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDraft(null);
                submitOnCtrlEnter(e);
                onKeyDown(e);
              }}
            />
          </div>
          {saveError && <div className="modal-error">{errorMessage(saveError, "No se pudo guardar el comentario.")}</div>}
          <div className="doc-c-actions">
            <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={saving || !draft.trim()}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Revisado por quien mira. Es personal: lo nuevo de otra persona lo desmarca solo, y lo
 * propio (comentar, editar, cerrar…) lo deja marcado.
 */
function ReviewToggle({ projectId, number, reviewed }: { projectId: string; number: number; reviewed: boolean }) {
  const setReviewed = useSetIssueReviewed(projectId, number);
  const pending = setReviewed.isPending;

  return (
    <div className="flex flex-col items-end gap-1">
      {reviewed ? (
        <div className="flex h-7 items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok">
            <CheckIcon />
            Revisado
          </span>
          <button
            type="button"
            className="cursor-pointer text-sm text-text-3 transition-colors duration-100 hover:text-accent disabled:cursor-default disabled:opacity-60"
            disabled={pending}
            onClick={() => setReviewed.mutate(false)}
          >
            {pending ? "Desmarcando…" : "Desmarcar"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() => setReviewed.mutate(true)}
          title="Lo nuevo de otra persona lo vuelve a dejar sin revisar"
        >
          <CheckIcon size={13} />
          {pending ? "Marcando…" : "Marcar como revisado"}
        </button>
      )}
      {setReviewed.isError && (
        <span className="text-xs text-danger" role="alert">
          {errorMessage(setReviewed.error, "No se pudo guardar. Intenta de nuevo.")}
        </span>
      )}
    </div>
  );
}

// El padre monta este componente con key={number}, así que el estado local
// se reinicia al cambiar de issue (ver issues/[issueNumber]/page.tsx).
export function IssueView({ projectId, number }: { projectId: string; number: number }) {
  const router = useRouter();
  const { data: project } = useProject(projectId);
  const { data: issue } = useIssue(projectId, number);

  // Edición del issue: los campos se cargan al pulsar "Editar".
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("IDEA");
  const [body, setBody] = useState("");
  const { textareaRef, format, onKeyDown } = useMarkdownEditor(body, setBody);

  const [newComment, setNewComment] = useState("");
  const {
    textareaRef: commentRef,
    format: formatComment,
    onKeyDown: onCommentKeyDown,
  } = useMarkdownEditor(newComment, setNewComment);
  const [closeReason, setCloseReason] = useState<IssueCloseReason>("RESUELTO");
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingFeature, setCreatingFeature] = useState(false);

  const updateIssue = useUpdateIssue(projectId, number);
  const setStatus = useSetIssueStatus(projectId, number);
  const deleteIssue = useDeleteIssue(projectId, number);
  const createComment = useCreateIssueComment(projectId, number);
  const updateComment = useUpdateIssueComment(projectId, number);

  if (!project || !issue) return null;

  const closed = issue.status === "CERRADO";
  // Lo que se crea desde el issue parte con su título y queda vinculado a él.
  const fromIssue = { name: issue.title, description: "" };

  function startEditing() {
    if (!issue) return;
    setTitle(issue.title);
    setType(issue.type);
    setBody(issue.body);
    updateIssue.reset();
    setEditing(true);
  }

  function handleSaveIssue(e: FormEvent) {
    e.preventDefault();
    updateIssue.mutate({ title, body, type }, { onSuccess: () => setEditing(false) });
  }

  function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    createComment.mutate(newComment, { onSuccess: () => setNewComment("") });
  }

  function handleDelete() {
    if (!window.confirm(`¿Eliminar el issue #${number} y toda su conversación? Esta acción no se puede deshacer.`)) return;
    deleteIssue.mutate(undefined, { onSuccess: () => router.push(`/proyectos/${projectId}`) });
  }

  // Acciones de la barra lateral: su error se muestra bajo ellas.
  const sideError = [setStatus, deleteIssue].find((m) => m.isError)?.error ?? null;

  return (
    <section className="doc-ew">
      <div>
        <div className="card issue-main-card">
          {editing ? (
            <form onSubmit={handleSaveIssue}>
              <div className="form-field">
                <div className="f-label">Título</div>
                <input
                  className="field-input"
                  value={title}
                  maxLength={MAX_ISSUE_TITLE_LENGTH}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-field">
                <div className="f-label">Tipo</div>
                <select className="field-select" value={type} onChange={(e) => setType(e.target.value as IssueType)}>
                  {ISSUE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <div className="f-label">Descripción</div>
                <div className="md-frame">
                  <MarkdownToolbar onFormat={format} />
                  <textarea
                    ref={textareaRef}
                    className="field-textarea issue-body-input"
                    value={body}
                    maxLength={MAX_ISSUE_BODY_LENGTH}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      submitOnCtrlEnter(e);
                      onKeyDown(e);
                    }}
                  />
                </div>
              </div>
              {updateIssue.isError && (
                <div className="modal-error">{errorMessage(updateIssue.error, "No se pudo guardar el issue. Intenta de nuevo.")}</div>
              )}
              <div className="doc-c-actions">
                <button type="button" className="btn-ghost btn-sm" disabled={updateIssue.isPending} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary btn-sm" disabled={updateIssue.isPending}>
                  {updateIssue.isPending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="issue-head">
                <div className="issue-title">
                  <span className="issue-number">#{issue.number}</span> {issue.title}
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <ReviewToggle projectId={projectId} number={number} reviewed={issue.reviewedByMe} />
                  {issue.canEdit && (
                    <button type="button" className="btn-ghost btn-sm" onClick={startEditing}>
                      Editar
                    </button>
                  )}
                </div>
              </div>
              <div className="issue-sub">
                <Badge color={issueStatusColor[issue.status]}>
                  {closed && issue.closeReason
                    ? `${issueStatusLabel[issue.status]} · ${issueCloseReasonLabel[issue.closeReason]}`
                    : issueStatusLabel[issue.status]}
                </Badge>
                <IssueTypeTag type={issue.type} />
                <span>
                  Abierto por {issue.author || "Ex miembro"} · {issue.createdAt}
                </span>
                {closed && (
                  <span>
                    Cerrado por {issue.closedBy || "Ex miembro"} · {issue.closedAt}
                  </span>
                )}
              </div>
              <div className="issue-body">
                {issue.body.trim() ? <Markdown>{issue.body}</Markdown> : <div className="doc-e-empty">Sin descripción.</div>}
              </div>
            </>
          )}
        </div>

        <div className="card issue-thread">
          <div className="ds-lbl">
            Conversación{issue.comments.length > 0 && <span className="label-count">{issue.comments.length}</span>}
          </div>
          {issue.comments.length === 0 ? (
            <div className="doc-v-empty">Todavía no hay comentarios. Escribe el primero abajo.</div>
          ) : (
            issue.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                saving={updateComment.isPending && updateComment.variables?.commentId === comment.id}
                saveError={updateComment.variables?.commentId === comment.id ? updateComment.error : null}
                onSave={(text, onDone) => updateComment.mutate({ commentId: comment.id, body: text }, { onSuccess: onDone })}
              />
            ))
          )}

          <form className="issue-composer" onSubmit={handleComment}>
            <div className="md-frame">
              <MarkdownToolbar onFormat={formatComment} />
              <textarea
                ref={commentRef}
                className="doc-c-input"
                value={newComment}
                maxLength={MAX_ISSUE_COMMENT_LENGTH}
                placeholder="Escribe un comentario…"
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  submitOnCtrlEnter(e);
                  onCommentKeyDown(e);
                }}
              />
            </div>
            {createComment.isError && (
              <div className="modal-error">{errorMessage(createComment.error, "No se pudo agregar el comentario.")}</div>
            )}
            <div className="issue-composer-foot">
              <span className="field-hint" style={{ marginTop: 0 }}>Ctrl+Enter para enviar</span>
              <button type="submit" className="btn-primary btn-sm" disabled={createComment.isPending || !newComment.trim()}>
                {createComment.isPending ? "Enviando…" : "Comentar"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <aside className="side-panel">
        <div className="side-sec">
          <div className="ds-lbl">Estado</div>
          {closed ? (
            <button
              type="button"
              className="btn-ghost issue-side-btn"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: "ABIERTO" })}
            >
              {setStatus.isPending ? "Reabriendo…" : "Reabrir issue"}
            </button>
          ) : (
            <div className="issue-close-row">
              <select
                className="field-select"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value as IssueCloseReason)}
                aria-label="Motivo de cierre"
              >
                {ISSUE_CLOSE_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary issue-side-btn"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ status: "CERRADO", closeReason })}
              >
                {setStatus.isPending ? "Cerrando…" : "Cerrar issue"}
              </button>
            </div>
          )}
        </div>

        <div className="side-sec">
          <div className="ds-lbl">Llevar a trabajo</div>
          <button type="button" className="btn-ghost issue-side-btn" onClick={() => setCreatingTask(true)}>
            Crear tarea
          </button>
          <button type="button" className="btn-ghost issue-side-btn" onClick={() => setCreatingFeature(true)}>
            Crear feature
          </button>
        </div>

        <IssueLinksPanel project={project} number={number} />

        {(issue.canDelete || sideError) && (
          <div className="side-sec">
            {sideError && (
              <div className="modal-error" style={{ marginBottom: issue.canDelete ? 10 : 0 }}>
                {errorMessage(sideError, "No se pudo completar la acción. Intenta de nuevo.")}
              </div>
            )}
            {issue.canDelete && (
              <button type="button" className="btn-text-danger" disabled={deleteIssue.isPending} onClick={handleDelete}>
                {deleteIssue.isPending ? "Eliminando…" : "Eliminar issue"}
              </button>
            )}
          </div>
        )}
      </aside>

      {creatingTask && (
        <CreateTaskModal
          projectId={project.id}
          features={project.features}
          team={project.team}
          labelsToken={project.labelsToken}
          initial={fromIssue}
          issueNumber={number}
          onClose={() => setCreatingTask(false)}
        />
      )}
      {creatingFeature && (
        <CreateFeatureModal
          projectId={project.id}
          initial={fromIssue}
          issueNumber={number}
          onClose={() => setCreatingFeature(false)}
        />
      )}
    </section>
  );
}
