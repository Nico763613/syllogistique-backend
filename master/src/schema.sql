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

-- Étape 3 : appareils remontés par les installations
create table if not exists master_devices (
  id            bigserial primary key,
  license_id    bigint not null references master_licenses(id) on delete cascade,
  device_id     text not null,
  name          text,
  last_seen_at  timestamptz,
  blocked       boolean not null default false,
  disconnect_requested boolean not null default false,
  unique (license_id, device_id)
);

-- Modules activés par licence (liste séparée par des virgules ; COMMERCIAL = Caisse et Ventes)
alter table master_licenses add column if not exists modules text not null default 'COMMERCIAL';

-- Paiement confirmé : le logo personnalisé du client n'est transmis qu'après confirmation (licences existantes = confirmé)
alter table master_licenses add column if not exists payment_confirmed boolean not null default true;

-- Logo du client envoyé depuis le Master (image réduite, servie publiquement sous /logo/<id>.png)
create table if not exists master_client_logos (client_id bigint primary key references master_clients(id) on delete cascade, data text not null, updated_at timestamptz not null default now());

-- Signalements remontés par les installations (problèmes signalés par les utilisateurs et erreurs serveur)
create table if not exists master_reports (
  id          bigserial primary key,
  license_id  bigint not null references master_licenses(id) on delete cascade,
  remote_id   text not null,
  user_name   text,
  role        text,
  screen      text,
  message     text,
  context     text,
  status      text not null default 'NEW',
  reported_at timestamptz not null default now(),
  unique (license_id, remote_id)
);

-- Journal des envois d'e-mails remontés par les installations (statut et raison d'échec)
create table if not exists master_mails (
  id         bigserial primary key,
  license_id bigint not null references master_licenses(id) on delete cascade,
  remote_id  text not null,
  at         timestamptz not null default now(),
  recipient  text,
  subject    text,
  status     text not null,
  error      text,
  message    text,
  unique (license_id, remote_id)
);
