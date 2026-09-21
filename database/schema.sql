CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT NULL,
  email VARCHAR(320) NULL,
  loginMethod VARCHAR(64) NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hospitals (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  postal_code VARCHAR(24) NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  phone VARCHAR(64) NULL,
  website TEXT NULL,
  emergency_available BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('TRUSTED_RESOURCE','UNVERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
  capabilities TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMP NOT NULL,
  source_url TEXT NOT NULL,
  source_label VARCHAR(255) NOT NULL,
  data_source ENUM('official','openstreetmap') NOT NULL DEFAULT 'official',
  osm_type VARCHAR(16) NULL,
  osm_id VARCHAR(32) NULL,
  UNIQUE KEY hospitals_osm_source (osm_type, osm_id)
);

CREATE TABLE IF NOT EXISTS doctors (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  phone_label VARCHAR(255) NOT NULL,
  specialty VARCHAR(255) NOT NULL,
  hospital_id VARCHAR(64) NOT NULL,
  is_on_call BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMP NOT NULL,
  source_url TEXT NOT NULL,
  source_label VARCHAR(255) NOT NULL,
  CONSTRAINT fk_doctor_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(64) PRIMARY KEY,
  patient_relation VARCHAR(100) NOT NULL,
  raw_text TEXT NOT NULL,
  language VARCHAR(80) NOT NULL,
  urgency ENUM('EMERGENCY','URGENT','GENERAL') NOT NULL,
  care_category VARCHAR(64) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
  id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) NOT NULL,
  doctor_id VARCHAR(64) NULL,
  hospital_id VARCHAR(64) NULL,
  action_type ENUM('CALL_DOCTOR','CALL_112','NAVIGATE','SHARE_LOCATION','COPY_SUMMARY') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_action_incident FOREIGN KEY (incident_id) REFERENCES incidents(id),
  CONSTRAINT fk_action_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT fk_action_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);
