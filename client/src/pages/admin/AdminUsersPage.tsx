import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api";
import type { AdminAssignment, EntityId, Person, Position, Role, Unit, UserListItem } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  buildUserRows,
  UserDirectory,
  UserStats
} from "../../components/admin/users";
import type { UserAdminRow } from "../../components/admin/users/types";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

type UsersPageData = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  roles: Role[];
  units: Unit[];
  users: UserListItem[];
};

type ActiveModal = "create" | "edit" | "assign" | "access" | "resetPassword" | "actions" | "delete" | null;

type CreateUserForm = {
  personMode: "new" | "existing";
  person_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  person_email: string;
  phone: string;
  username: string;
  account_email: string;
  password: string;
  status: string;
  must_change_password: boolean;
  role_names: string[];
};

type EditUserForm = {
  first_name: string;
  last_name: string;
  display_name: string;
  person_email: string;
  phone: string;
  username: string;
  account_email: string;
  status: string;
  must_change_password: boolean;
  role_names: string[];
};

type AssignmentForm = {
  position_id: string;
  status: string;
  is_primary: boolean;
};

type AccessForm = {
  status: string;
  must_change_password: boolean;
  role_names: string[];
};

type ResetPasswordForm = {
  password: string;
};

const emptyData: UsersPageData = {
  assignments: [],
  persons: [],
  positions: [],
  roles: [],
  units: [],
  users: []
};

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultUser(users: UserListItem[]) {
  return users.find((user) => user.status === "active") || users[0] || null;
}

function roleLabel(role: Role) {
  return role.displayName || role.display_name || role.name;
}

function createFormDefaults(): CreateUserForm {
  return {
    account_email: "",
    display_name: "",
    first_name: "",
    last_name: "",
    must_change_password: true,
    password: "",
    personMode: "new",
    person_email: "",
    person_id: "",
    phone: "",
    role_names: [],
    status: "pending_activation",
    username: ""
  };
}

function editFormFor(row: UserAdminRow): EditUserForm {
  return {
    account_email: row.user.email,
    display_name: row.person?.display_name || row.user.personDisplayName,
    first_name: row.person?.first_name || row.user.personDisplayName,
    last_name: row.person?.last_name || "",
    must_change_password: row.user.mustChangePassword,
    person_email: row.person?.email || "",
    phone: row.person?.phone || "",
    role_names: row.user.roleNames || [],
    status: row.user.status,
    username: row.user.username
  };
}

function accessFormFor(row: UserAdminRow): AccessForm {
  return {
    must_change_password: row.user.mustChangePassword,
    role_names: row.user.roleNames || [],
    status: row.user.status
  };
}

function positionOptionLabel(position: Position, unitsById: Map<EntityId, Unit>) {
  const unit = unitsById.get(position.unit_id);
  const unitName = unit?.name || position.unitName || position.unitCode || "";
  return unitName ? `${position.title} - ${unitName}` : position.title;
}

function assignmentFormFor(row: UserAdminRow, positions: Position[]): AssignmentForm {
  const firstPosition = positions.find((position) => position.status === "active") || positions[0];
  return {
    is_primary: row.activeAssignments.length === 0,
    position_id: String(row.position?.id || firstPosition?.id || ""),
    status: "active"
  };
}

function resetPasswordDefaults(): ResetPasswordForm {
  return { password: "" };
}

function toggleRole(current: string[], roleName: string, checked: boolean) {
  if (checked) {
    return Array.from(new Set([...current, roleName]));
  }

  return current.filter((item) => item !== roleName);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export function AdminUsersPage() {
  const { t } = useI18n();
  const [data, setData] = useState<UsersPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<EntityId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalUserId, setModalUserId] = useState<EntityId | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateUserForm>(() => createFormDefaults());
  const [editForm, setEditForm] = useState<EditUserForm>(() => editFormFor({
    activeAssignments: [],
    assignments: [],
    canSign: false,
    id: 0,
    person: null,
    position: null,
    primaryAssignment: null,
    primaryUnit: null,
    roleLabel: "",
    setupStatus: "pending",
    unit: null,
    user: { createdAt: "", email: "", id: 0, mustChangePassword: true, personDisplayName: "", personId: 0, status: "pending_activation", username: "", uuid: "" }
  }));
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>({ is_primary: false, position_id: "", status: "active" });
  const [accessForm, setAccessForm] = useState<AccessForm>({ must_change_password: true, role_names: [], status: "pending_activation" });
  const [resetPasswordForm, setResetPasswordForm] = useState<ResetPasswordForm>(resetPasswordDefaults);

  const refreshUsers = useCallback(async (nextSelectedUserId?: EntityId | null) => {
    setLoading(true);
    const [users, persons, units, positions, assignments, roles] = await Promise.all([
      safe(adminApi.users.list(), [] as UserListItem[]),
      safe(adminApi.persons.list(), [] as Person[]),
      safe(adminApi.units.list(), [] as Unit[]),
      safe(adminApi.positions.list(), [] as Position[]),
      safe(adminApi.assignments.list(), [] as AdminAssignment[]),
      safe(adminApi.roles.list(), [] as Role[])
    ]);

    setData({ assignments, persons, positions, roles, units, users });
    setLoading(false);
    if (nextSelectedUserId !== undefined) {
      setSelectedUserId(nextSelectedUserId);
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    const selectedStillExists = selectedUserId ? data.users.some((user) => user.id === selectedUserId) : false;
    if (!selectedStillExists) {
      setSelectedUserId(chooseDefaultUser(data.users)?.id || null);
    }
  }, [data.users, selectedUserId]);

  const rows = useMemo(() => buildUserRows(data), [data]);
  const modalUser = modalUserId ? rows.find((row) => row.id === modalUserId) || null : null;
  const activePositions = data.positions.filter((position) => position.status === "active");
  const unitsById = useMemo(() => new Map<EntityId, Unit>(data.units.map((unit) => [unit.id, unit])), [data.units]);
  const stats = {
    active: data.users.filter((user) => user.status === "active").length,
    disabled: data.users.filter((user) => ["disabled", "inactive"].includes(user.status)).length,
    multiAssignment: rows.filter((row) => row.activeAssignments.length > 1).length,
    pending: data.users.filter((user) => ["pending", "pending_activation"].includes(user.status)).length,
    suspended: data.users.filter((user) => user.status === "suspended").length,
    total: data.users.length
  };
  const statusOptions = [
    { label: t("admin.users.status.active"), value: "active" },
    { label: t("admin.users.status.pendingActivation"), value: "pending_activation" },
    { label: t("admin.users.status.suspended"), value: "suspended" },
    { label: t("admin.users.status.disabled"), value: "disabled" }
  ];

  function closeModal() {
    setActiveModal(null);
    setModalUserId(null);
    setFormError(null);
    setBusy(false);
  }

  function viewUser(row: UserAdminRow) {
    setSelectedUserId(row.id);
    openActionsModal(row);
  }

  function openCreateUserModal() {
    setCreateForm(createFormDefaults());
    setFormError(null);
    setActiveModal("create");
  }

  function openEditUserModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setEditForm(editFormFor(row));
    setFormError(null);
    setActiveModal("edit");
  }

  function openAssignUserModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setAssignmentForm(assignmentFormFor(row, data.positions));
    setFormError(null);
    setActiveModal("assign");
  }

  function openAccessModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setAccessForm(accessFormFor(row));
    setFormError(null);
    setActiveModal("access");
  }

  function openResetPasswordModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setResetPasswordForm(resetPasswordDefaults());
    setFormError(null);
    setActiveModal("resetPassword");
  }

  function openActionsModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openDeleteModal(row: UserAdminRow) {
    setModalUserId(row.id);
    setFormError(null);
    setActiveModal("delete");
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    try {
      let personId = Number(createForm.person_id);
      if (createForm.personMode === "new") {
        const person = await adminApi.persons.create({
          display_name: createForm.display_name || undefined,
          email: createForm.person_email || createForm.account_email || null,
          first_name: createForm.first_name,
          last_name: createForm.last_name || null,
          phone: createForm.phone || null,
          status: "active"
        });
        personId = person.id;
      }

      if (!personId) {
        throw new Error(t("admin.users.form.selectPerson"));
      }

      const createdUser = await adminApi.users.create({
        email: createForm.account_email,
        must_change_password: createForm.must_change_password,
        password: createForm.password,
        person_id: personId,
        role_names: createForm.role_names,
        status: createForm.status,
        username: createForm.username
      });
      await refreshUsers(createdUser.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleEditUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalUser) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.persons.update(modalUser.user.personId, {
        display_name: editForm.display_name || undefined,
        email: editForm.person_email || null,
        first_name: editForm.first_name,
        last_name: editForm.last_name || null,
        phone: editForm.phone || null,
        status: modalUser.person?.status || "active"
      });
      await adminApi.users.update(modalUser.id, {
        email: editForm.account_email,
        must_change_password: editForm.must_change_password,
        role_names: editForm.role_names,
        status: editForm.status,
        username: editForm.username
      });
      await refreshUsers(modalUser.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleAssignUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalUser) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.assignments.create({
        is_primary: assignmentForm.is_primary,
        person_id: modalUser.user.personId,
        position_id: Number(assignmentForm.position_id),
        status: assignmentForm.status
      });
      await refreshUsers(modalUser.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleAccessUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalUser) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.users.update(modalUser.id, {
        must_change_password: accessForm.must_change_password,
        role_names: accessForm.role_names,
        status: accessForm.status
      });
      await refreshUsers(modalUser.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalUser) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.users.resetPassword(modalUser.id, { password: resetPasswordForm.password });
      await refreshUsers(modalUser.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updateUserStatus(row: UserAdminRow, status: string) {
    setBusy(true);
    setFormError(null);

    try {
      await adminApi.users.update(row.id, { status });
      await refreshUsers(row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleDeleteUser() {
    if (!modalUser) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.users.remove(modalUser.id);
      await refreshUsers(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  function renderRoleCheckboxes(value: string[], onChange: (next: string[]) => void) {
    if (!data.roles.length) {
      return <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{t("admin.users.form.noRoles")}</p>;
    }

    return (
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
        {data.roles.map((role) => (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700" key={role.id}>
            <input
              checked={value.includes(role.name)}
              className={checkboxClassName}
              onChange={(event) => onChange(toggleRole(value, role.name, event.target.checked))}
              type="checkbox"
            />
            <span>{roleLabel(role)}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <Button icon="plus" onClick={openCreateUserModal} variant="primary">{t("admin.users.actions.newUser")}</Button>
        )}
        description={t("admin.users.description")}
        title={t("admin.users.title")}
      />

      <UserStats
        labels={{
          active: t("admin.users.stats.active"),
          disabled: t("admin.users.stats.disabled"),
          multiAssignment: t("admin.users.stats.multiAssignment"),
          pending: t("admin.users.stats.pending"),
          suspended: t("admin.users.stats.suspended"),
          total: t("admin.users.stats.total")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="min-w-0">
        <UserDirectory
          onAssignUser={openAssignUserModal}
          onEditUser={openEditUserModal}
          onOpenUserActions={openActionsModal}
          onSelectUser={setSelectedUserId}
          onViewUser={viewUser}
          rows={rows}
          selectedUserId={selectedUserId}
          units={data.units}
        />
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="user-create-form" icon="plus" type="submit" variant="primary">{t("admin.users.form.createUser")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "create"}
        size="lg"
        title={t("admin.users.form.createTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="user-create-form" onSubmit={handleCreateUser}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <fieldset className="grid gap-2 md:col-span-2">
            <legend className={labelClassName}>{t("admin.users.form.personSource")}</legend>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={createForm.personMode === "new"} className={checkboxClassName} onChange={() => setCreateForm((form) => ({ ...form, personMode: "new" }))} type="radio" />
                {t("admin.users.form.newPerson")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={createForm.personMode === "existing"} className={checkboxClassName} onChange={() => setCreateForm((form) => ({ ...form, personMode: "existing" }))} type="radio" />
                {t("admin.users.form.existingPerson")}
              </label>
            </div>
          </fieldset>

          {createForm.personMode === "existing" ? (
            <label className={`${labelClassName} md:col-span-2`}>
              {t("admin.users.form.person")}
              <select className={fieldClassName} onChange={(event) => setCreateForm((form) => ({ ...form, person_id: event.target.value }))} required value={createForm.person_id}>
                <option value="" disabled>{t("admin.users.form.selectPerson")}</option>
                {data.persons.map((person) => (
                  <option key={person.id} value={person.id}>{person.display_name}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={labelClassName}>
                {t("admin.users.form.firstName")}
                <input className={fieldClassName} onChange={(event) => setCreateForm((form) => ({ ...form, first_name: event.target.value }))} required value={createForm.first_name} />
              </label>
              <label className={labelClassName}>
                {t("admin.users.form.lastName")}
                <input className={fieldClassName} onChange={(event) => setCreateForm((form) => ({ ...form, last_name: event.target.value }))} value={createForm.last_name} />
              </label>
              <label className={labelClassName}>
                {t("admin.users.form.displayName")}
                <input className={fieldClassName} onChange={(event) => setCreateForm((form) => ({ ...form, display_name: event.target.value }))} value={createForm.display_name} />
              </label>
              <label className={labelClassName}>
                {t("admin.users.form.personEmail")}
                <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setCreateForm((form) => ({ ...form, person_email: event.target.value }))} type="email" value={createForm.person_email} />
              </label>
              <label className={labelClassName}>
                {t("admin.users.form.phone")}
                <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setCreateForm((form) => ({ ...form, phone: event.target.value }))} value={createForm.phone} />
              </label>
            </>
          )}

          <label className={labelClassName}>
            {t("admin.users.form.username")}
            <input className={`${fieldClassName} force-ltr text-start`} minLength={3} onChange={(event) => setCreateForm((form) => ({ ...form, username: event.target.value }))} required value={createForm.username} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.accountEmail")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setCreateForm((form) => ({ ...form, account_email: event.target.value }))} required type="email" value={createForm.account_email} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.temporaryPassword")}
            <input className={`${fieldClassName} force-ltr text-start`} minLength={8} onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))} required type="password" value={createForm.password} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.status")}
            <select className={fieldClassName} onChange={(event) => setCreateForm((form) => ({ ...form, status: event.target.value }))} value={createForm.status}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input checked={createForm.must_change_password} className={checkboxClassName} onChange={(event) => setCreateForm((form) => ({ ...form, must_change_password: event.target.checked }))} type="checkbox" />
            {t("admin.users.form.mustChangePassword")}
          </label>
          <div className="md:col-span-2">
            <p className={labelClassName}>{t("admin.users.form.roles")}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t("admin.users.form.rolesHelp")}</p>
            <div className="mt-1">{renderRoleCheckboxes(createForm.role_names, (role_names) => setCreateForm((form) => ({ ...form, role_names })))}</div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="user-edit-form" icon="edit" type="submit" variant="primary">{t("admin.users.form.saveUser")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "edit"}
        size="lg"
        title={t("admin.users.form.editTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="user-edit-form" onSubmit={handleEditUser}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.users.form.firstName")}
            <input className={fieldClassName} onChange={(event) => setEditForm((form) => ({ ...form, first_name: event.target.value }))} required value={editForm.first_name} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.lastName")}
            <input className={fieldClassName} onChange={(event) => setEditForm((form) => ({ ...form, last_name: event.target.value }))} value={editForm.last_name} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.displayName")}
            <input className={fieldClassName} onChange={(event) => setEditForm((form) => ({ ...form, display_name: event.target.value }))} value={editForm.display_name} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.personEmail")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setEditForm((form) => ({ ...form, person_email: event.target.value }))} type="email" value={editForm.person_email} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.phone")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setEditForm((form) => ({ ...form, phone: event.target.value }))} value={editForm.phone} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.username")}
            <input className={`${fieldClassName} force-ltr text-start`} minLength={3} onChange={(event) => setEditForm((form) => ({ ...form, username: event.target.value }))} required value={editForm.username} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.accountEmail")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setEditForm((form) => ({ ...form, account_email: event.target.value }))} required type="email" value={editForm.account_email} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.status")}
            <select className={fieldClassName} onChange={(event) => setEditForm((form) => ({ ...form, status: event.target.value }))} value={editForm.status}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input checked={editForm.must_change_password} className={checkboxClassName} onChange={(event) => setEditForm((form) => ({ ...form, must_change_password: event.target.checked }))} type="checkbox" />
            {t("admin.users.form.mustChangePassword")}
          </label>
          <div className="md:col-span-2">
            <p className={labelClassName}>{t("admin.users.form.roles")}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t("admin.users.form.rolesHelp")}</p>
            <div className="mt-1">{renderRoleCheckboxes(editForm.role_names, (role_names) => setEditForm((form) => ({ ...form, role_names })))}</div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="user-assign-form" icon="users" type="submit" variant="primary">{t("admin.users.form.saveAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "assign"}
        title={t("admin.users.form.assignTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="user-assign-form" onSubmit={handleAssignUser}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={`${labelClassName} md:col-span-2`}>
            {t("admin.users.form.user")}
            <input className={fieldClassName} disabled readOnly value={modalUser?.user.personDisplayName || ""} />
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.position")}
            <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, position_id: event.target.value }))} required value={assignmentForm.position_id}>
              <option value="" disabled>{t("admin.users.form.selectPosition")}</option>
              {activePositions.map((position) => <option key={position.id} value={position.id}>{positionOptionLabel(position, unitsById)}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.users.form.assignmentStatus")}
            <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, status: event.target.value }))} value={assignmentForm.status}>
              <option value="active">{t("admin.users.status.active")}</option>
              <option value="pending">{t("admin.users.status.pendingActivation")}</option>
              <option value="suspended">{t("admin.users.status.suspended")}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input checked={assignmentForm.is_primary} className={checkboxClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, is_primary: event.target.checked }))} type="checkbox" />
            {t("admin.users.form.primaryAssignment")}
          </label>
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="user-access-form" icon="shield" type="submit" variant="primary">{t("admin.users.form.saveAccess")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "access"}
        title={t("admin.users.form.accessTitle")}
      >
        <form className="grid gap-4" id="user-access-form" onSubmit={handleAccessUpdate}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.users.form.status")}
            <select className={fieldClassName} onChange={(event) => setAccessForm((form) => ({ ...form, status: event.target.value }))} value={accessForm.status}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input checked={accessForm.must_change_password} className={checkboxClassName} onChange={(event) => setAccessForm((form) => ({ ...form, must_change_password: event.target.checked }))} type="checkbox" />
            {t("admin.users.form.mustChangePassword")}
          </label>
          <div>
            <p className={labelClassName}>{t("admin.users.form.roles")}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t("admin.users.form.rolesHelp")}</p>
            <div className="mt-1">{renderRoleCheckboxes(accessForm.role_names, (role_names) => setAccessForm((form) => ({ ...form, role_names })))}</div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="user-reset-form" icon="lock" type="submit" variant="primary">{t("admin.users.form.resetPassword")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "resetPassword"}
        title={t("admin.users.form.resetPasswordTitle")}
      >
        <form className="grid gap-4" id="user-reset-form" onSubmit={handleResetPassword}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <p className="text-sm leading-6 text-slate-600">{t("admin.users.form.resetPasswordDescription")}</p>
          <label className={labelClassName}>
            {t("admin.users.form.temporaryPassword")}
            <input className={`${fieldClassName} force-ltr text-start`} minLength={8} onChange={(event) => setResetPasswordForm({ password: event.target.value })} required type="password" value={resetPasswordForm.password} />
          </label>
        </form>
      </AdminModal>

      <AdminModal
        footer={<Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title={t("admin.users.form.actionsTitle")}
      >
        {modalUser ? (
          <div className="space-y-3">
            {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-sm font-bold text-[#061d49]">{modalUser.user.personDisplayName}</p>
              <p className="force-ltr mt-1 text-xs font-semibold text-slate-500">{modalUser.user.username}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="justify-start" icon="edit" onClick={() => openEditUserModal(modalUser)}>{t("admin.users.directory.edit")}</Button>
              <Button className="justify-start" icon="users" onClick={() => openAssignUserModal(modalUser)}>{t("admin.users.directory.assign")}</Button>
              <Button className="justify-start" icon="lock" onClick={() => openResetPasswordModal(modalUser)}>{t("admin.users.inspector.resetPassword")}</Button>
              <Button className="justify-start" icon="shield" onClick={() => openAccessModal(modalUser)}>{t("admin.users.inspector.manageAccess")}</Button>
              <Button className="justify-start" icon="userCheck" onClick={() => void updateUserStatus(modalUser, "active")}>{t("admin.users.form.activate")}</Button>
              <Button className="justify-start" icon="pause" onClick={() => void updateUserStatus(modalUser, "suspended")}>{t("admin.users.form.suspend")}</Button>
              <Button className="justify-start" icon="userX" onClick={() => void updateUserStatus(modalUser, "disabled")}>{t("admin.users.form.disable")}</Button>
              <Button className="justify-start sm:col-span-2" icon="userX" onClick={() => openDeleteModal(modalUser)} variant="danger">{t("admin.users.form.deleteUser")}</Button>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} icon="userX" onClick={() => void handleDeleteUser()} variant="danger">{t("admin.users.form.deleteUser")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "delete"}
        title={t("admin.users.form.deleteTitle")}
      >
        <div className="space-y-3">
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <p className="text-sm leading-6 text-slate-700">{t("admin.users.form.deleteDescription")}</p>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{modalUser?.user.personDisplayName || "-"}</div>
        </div>
      </AdminModal>
    </div>
  );
}
