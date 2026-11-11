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

-- Étape 2 : clients et licences
create table if not exists master_settings (
  key   text primary key,
  value text not null
);
create table if not exists master_clients (
  id           bigserial primary key,
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  country      text,
  brand_color  text,
  logo_url     text,
  notes        text,
  status       text not null default 'actif',
  created_at   timestamptz not null default now()
);
create table if not exists master_licenses (
  id              bigserial primary key,
  client_id       bigint not null references master_clients(id) on delete cascade,
  code_hash       text not null unique,
  code_hint       text not null,
  plan            text not null default 'standard',
  max_devices     int not null default 50,
  permanent       boolean not null default false,
  expires_at      timestamptz,
  status          text not null default 'PENDING',
  instance_id     text,
  instance_url    text,
  instance_key_hash text,
  app_version     text,
  activated_at    timestamptz,
  last_check_at   timestamptz,
  last_check_ip   text,
  status_reason   text,
  created_at      timestamptz not null default now()
);
create index if not exists master_licenses_client on master_licenses (client_id);
