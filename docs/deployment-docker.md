# Deployment using Docker

Using Docker is the most easy and recommended way to run Flyto. There is an 
[official Container](https://github.com/arayan48/flyto/pkgs/container/flyto) which is 
updated whenever a GitHub push occurs.

```bash
docker run -d -v $PWD/data:/data -p 3000:3000 ghcr.io/arayan48/flyto
```
The above command starts the Flyto Docker container and 
 * `-d` puts the process into background (daemon mode)
 * `-v` mounts the data volume into the container
 * `-p` forwards the traffic from port 3000 into the container

**Protipp**: There are several [container tags](https://github.com/arayan48/flyto/pkgs/container/flyto)
if you want to use a specific version. E.g. `1` is always the latest stable `1.x.x` and `1.1`
correlates with `1.1.x`.

If you want to customize some Flyto configurations use environment parameters
by adding `-e` flags to the `docker run` command.

```bash
docker run -v $PWD/data:/data -p 3000:8080 \
  -e FLYTO_PORT=8080 \
  -e FLYTO_DEFAULT_RETENTION=3600 \
  ghcr.io/arayan48/flyto
```

**Protipp**: By adding `--restart always` Docker will autostart the container after reboots.  
