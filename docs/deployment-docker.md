# Deployment using Docker

Using Docker is the most easy and recommended way to run Flyto. There is an 
[official Container](https://github.com/arayan48/flyto/pkgs/container/flyto) which is 
published for every release.

Flyto needs a PostgreSQL database for the file metadata. The easiest way is the
[docker-compose.yml](https://github.com/arayan48/flyto/blob/main/docker-compose.yml) at the root of
the repository, which starts Flyto and PostgreSQL together (`docker compose up -d`).

With an existing database:

```bash
docker run -d -v $PWD/data:/data -p 3000:3000 \
  -e FLYTO_DB_URL=postgres://flyto:secret@db-host:5432/flyto \
  -e FLYTO_ADMIN_EMAIL=me@example.com -e FLYTO_ADMIN_PASSWORD='a long password' \
  -e FLYTO_PUBLIC_URL=https://files.example.com/ \
  ghcr.io/arayan48/flyto:v0.5.1
```
The above command starts the Flyto Docker container and 
 * `-d` puts the process into background (daemon mode)
 * `-v` mounts the data volume into the container, it is handed over to the `node` user (UID 1000) on start
 * `-p` forwards the traffic from port 3000 into the container
 * `-e FLYTO_DB_URL` points to the PostgreSQL database
 * `-e FLYTO_ADMIN_EMAIL` / `FLYTO_ADMIN_PASSWORD` create the first admin account (or open `/setup`
   with the code printed in `docker logs`), see [accounts.md](accounts.md)

**Protipp**: There are several [container tags](https://github.com/arayan48/flyto/pkgs/container/flyto)
if you want to use a specific version. E.g. `v1` is always the latest stable `1.x.x` and `v1.1`
correlates with `1.1.x`. `latest` follows the `main` branch and is meant for testing only.

If you want to customize some Flyto configurations use environment parameters
by adding `-e` flags to the `docker run` command.

```bash
docker run -v $PWD/data:/data -p 3000:8080 \
  -e FLYTO_DB_URL=postgres://flyto:secret@db-host:5432/flyto \
  -e FLYTO_PORT=8080 \
  -e FLYTO_DEFAULT_RETENTION=3600 \
  ghcr.io/arayan48/flyto
```

**Protipp**: By adding `--restart always` Docker will autostart the container after reboots.  
