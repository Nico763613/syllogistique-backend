-- SYLLOGISTIQUE MASTER — étape 1 : accès propriétaire et journal d'audit
create table if not exists master_admins (
  id            bigserial primary key,
  email         text not null unique,
  password_hash text not null,
  totp_secret   text,
  totp_enabled  boolean not null default false,
  failed_logins int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create table if not exists master_recovery_codes (
  id        bigserial primary key,
  admin_id  bigint not null references master_admins(id) on delete cascade,
  code_hash text not null,
  used_at   timestamptz
);
create table if not exists master_audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  admin_id   bigint,
  action     text not null,
  detail     text,
  ip         text
);
create index if not exists master_audit_log_at on master_audit_log (at desc);
