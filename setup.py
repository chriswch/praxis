from setuptools import find_packages, setup


setup(
    name="praxis",
    version="0.1.0",
    description="Spec-driven software engineering workflows for Claude Code and Codex.",
    python_requires=">=3.9",
    packages=find_packages(include=["workflow", "workflow.*"]),
    include_package_data=True,
    package_data={
        "workflow": ["contracts/*.json", "pipelines/*.md", "reference/*.md"],
    },
    entry_points={
        "console_scripts": [
            "praxis=workflow.scripts.praxis_cli:main",
        ]
    },
)
