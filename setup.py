from setuptools import find_packages, setup


setup(
    name="praxis",
    version="0.1.0",
    description="Spec-driven software engineering workflows for Claude Code and Codex.",
    packages=find_packages(include=["workflow", "workflow.*"]),
    entry_points={
        "console_scripts": [
            "praxis=workflow.scripts.praxis_cli:main",
        ]
    },
)
