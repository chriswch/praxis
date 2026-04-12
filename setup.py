from setuptools import find_packages, setup


setup(
    name="praxis",
    version="0.1.0",
    description="Spec-driven software engineering workflows for Claude Code and Codex.",
    python_requires=">=3.9",
    package_dir={"": "src"},
    packages=find_packages(where="src", include=["praxis", "praxis.*"]),
    include_package_data=True,
    package_data={
        "praxis": ["contracts/*.json", "workflows/*.md", "workflows/reference/*.md"],
    },
    entry_points={
        "console_scripts": [
            "praxis=praxis.cli.main:main",
        ]
    },
)
