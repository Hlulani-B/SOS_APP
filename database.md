# Database Schema

## locations

```sql
CREATE TABLE locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL
);
```

| Field | Type | Constraints |
|---|---|---|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| email | VARCHAR(255) | NULL |
| latitude | DECIMAL(9,6) | NULL |
| longitude | DECIMAL(9,6) | NULL |

## users

```sql
CREATE TABLE users (
    email VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    surname VARCHAR(255),
    pals_email TEXT[]
);
```

| Field | Type | Constraints |
|---|---|---|
| email | VARCHAR(255) | PRIMARY KEY |
| name | VARCHAR(255) | |
| surname | VARCHAR(255) | |
| pals_email | TEXT[] | array of emails (PostgreSQL only) |

Note: `pals_email` uses a PostgreSQL array type. If using MySQL or another engine without array support, replace with a join table:

```sql
CREATE TABLE user_pals (
    user_email VARCHAR(255) REFERENCES users(email),
    pal_email VARCHAR(255),
    PRIMARY KEY (user_email, pal_email)
);
```

## invite

```sql
CREATE TABLE invite (
    id SERIAL PRIMARY KEY,
    inviter VARCHAR(255) REFERENCES users(email),
    invitee VARCHAR(255) REFERENCES users(email),
    status VARCHAR(20) DEFAULT 'pending'
);
```

| Field | Type | Constraints |
|---|---|---|
| id | SERIAL | PRIMARY KEY |
| inviter | VARCHAR(255) | REFERENCES users(email) |
| invitee | VARCHAR(255) | REFERENCES users(email) |
| status | VARCHAR(20) | DEFAULT 'pending' — values: pending, accepted, rejected |