import subprocess


def install_browsers():
    subprocess.run(
        ["playwright", "install", "chromium"],
        check=True,
    )
