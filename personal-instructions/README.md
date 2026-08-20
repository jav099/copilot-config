# Personal instructions

The `*.instructions.md` files in this directory are normal files tracked by the
personal Git repository. Ignored symlinks expose these files to individual
repository checkouts under `.github/instructions/`.

Run the installer with one or more repository roots:

```sh
python3 ~/.copilot/personal-instructions/install.py <repository-root> [<repository-root> ...]
```
