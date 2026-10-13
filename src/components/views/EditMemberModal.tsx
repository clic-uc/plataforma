"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole, MemberStatus } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { AvailabilityGrid } from "@/components/ui/AvailabilityGrid";
import { useCurrentMember } from "@/components/providers/CurrentMemberProvider";
import { errorMessage } from "@/lib/api/http";
import { MEMBER_ROLE_OPTIONS, MEMBER_STATUS_OPTIONS } from "@/lib/api/status";
import {
  MAX_AREA_LENGTH,
  MAX_LEVEL,
  MAX_NAME_LENGTH,
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  MONTH_OPTIONS,
  daysInBirthdayMonth,
  normalizeSkills,
  parseBirthdayValue,
  toBirthdayValue,
  type AvailabilitySlot,
} from "@/lib/api/member-fields";
import { useUpdateMember, type MemberDetail, type UpdateMemberInput } from "@/lib/api/members";

export function EditMemberModal({ member, onClose }: { member: MemberDetail; onClose: () => void }) {
  const router = useRouter();
  const current = useCurrentMember();
  const isCoordinacion = current.role === "COORDINACION";
  const isSelf = current.id === member.id;

  const initialBirthday = member.birthdayValue ? parseBirthdayValue(member.birthdayValue) : null;
  const [name, setName] = useState(member.name);
  const [birthMonth, setBirthMonth] = useState(initialBirthday ? String(initialBirthday.month) : "");
  const [birthDay, setBirthDay] = useState(initialBirthday ? String(initialBirthday.day) : "");
  const [skillsText, setSkillsText] = useState(member.skills.join(", "));
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(member.availability);
  const [area, setArea] = useState(member.area);
  const [role, setRole] = useState<MemberRole>(member.roleValue);
  const [status, setStatus] = useState<MemberStatus>(member.statusValue);
  const [level, setLevel] = useState(String(member.level));

  const mutation = useUpdateMember(member.id);

  const skills = normalizeSkills(skillsText.split(","));
  const dayOptions = birthMonth ? daysInBirthdayMonth(Number(birthMonth)) : 31;
  // Mes y día van juntos: con uno solo no hay cumpleaños que guardar.
  const birthdayIncomplete = (birthMonth === "") !== (birthDay === "");

  function toggleSlot(slot: AvailabilitySlot) {
    setAvailability((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  function handleMonthChange(value: string) {
    setBirthMonth(value);
    if (value && Number(birthDay) > daysInBirthdayMonth(Number(value))) setBirthDay("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!skills || birthdayIncomplete) return;

    const input: UpdateMemberInput = {
      name,
      birthday: birthMonth && birthDay ? toBirthdayValue(Number(birthMonth), Number(birthDay)) : null,
      skills,
      availability,
    };
    if (isCoordinacion) input.admin = { area, role, status, level: Number(level) };

    mutation.mutate(input, {
      onSuccess: () => {
        // El nombre y el rol propios llegan al sidebar desde el layout, que es
        // server: hay que volver a renderizarlo.
        if (isSelf) router.refresh();
        onClose();
      },
    });
  }

  return (
    <Modal title={isSelf ? "Editar mi perfil" : `Editar perfil — ${member.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <div className="f-label">Nombre</div>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            required
          />
        </div>

        <div className="field-row">
          <div className="form-field">
            <div className="f-label">Cumpleaños · mes</div>
            <select className="field-select" value={birthMonth} onChange={(e) => handleMonthChange(e.target.value)}>
              <option value="">Sin registrar</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <div className="f-label">Día</div>
            <select className="field-select" value={birthDay} onChange={(e) => setBirthDay(e.target.value)}>
              <option value="">—</option>
              {Array.from({ length: dayOptions }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <div className="f-label">Habilidades técnicas</div>
          <input
            className="field-input"
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="Separadas por coma. Ej: React, Python, SQL"
          />
        </div>

        <div className="form-field">
          <div className="f-label">Disponibilidad semanal</div>
          <AvailabilityGrid value={availability} onToggle={toggleSlot} />
        </div>

        {isCoordinacion && (
          <>
            <div className="perfil-section-label" style={{ textAlign: "left" }}>Coordinación</div>
            <div className="field-row">
              <div className="form-field">
                <div className="f-label">Área</div>
                <input
                  className="field-input"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  maxLength={MAX_AREA_LENGTH}
                  required
                />
              </div>
              <div className="form-field">
                <div className="f-label">Rol</div>
                <select className="field-select" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                  {MEMBER_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="form-field">
                <div className="f-label">Estado</div>
                <select
                  className="field-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as MemberStatus)}
                >
                  {MEMBER_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <div className="f-label">Nivel</div>
                <input
                  type="number"
                  className="field-input"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  min={0}
                  max={MAX_LEVEL}
                  step={1}
                  required
                />
              </div>
            </div>
          </>
        )}

        {!skills && (
          <div className="modal-error">
            Máximo {MAX_SKILLS} habilidades, de hasta {MAX_SKILL_LENGTH} caracteres cada una.
          </div>
        )}
        {birthdayIncomplete && <div className="modal-error">Elige mes y día del cumpleaños, o ninguno.</div>}
        {mutation.isError && (
          <div className="modal-error">
            {errorMessage(mutation.error, "No se pudo guardar el perfil. Intenta de nuevo.")}
          </div>
        )}

        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 4 }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={mutation.isPending || !skills || birthdayIncomplete}
          >
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
