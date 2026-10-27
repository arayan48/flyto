# Deployment as Systemd service 

You can also install Flyto as (Linux) system service. Most distributions
use Systemd as main init system. You should **not** run Flyto with root privileges!

**Preparation**

```bash
# Create a target folder for Flyto
mkdir -p /opt/flyto
cd /opt/flyto

# Download and extract a prebuild
curl -sL https://github.com/arayan48/flyto/releases/download/1.1.0-beta/flyto-1.1.0-beta.tar.gz | tar xz --strip 1

# Install dependencies
npm install --production

# Add a user flyto
sudo useradd --system flyto
 
# Make flyto owner of /opt/flyto
sudo chown -R flyto:flyto /opt/flyto 
```

**Systemd unit file**

Grab the [flyto.service](https://github.com/arayan48/flyto/blob/main/docs/flyto.service)
sample file, put it in `/etc/systemd/system/` and adjust to your needs.

```bash
cd /etc/systemd/system
sudo wget https://raw.githubusercontent.com/arayan48/flyto/main/docs/flyto.service

# Start the service
sudo systemctl start flyto

# Show the status
sudo systemctl status flyto

# Enable autostart on boot
sudo systemctl enable flyto
```
