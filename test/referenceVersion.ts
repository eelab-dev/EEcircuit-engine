export type BuildReferenceMeta = {
    version?: string;
    toolchainResolution?: { ngspiceRef?: string };
};

export function referenceVersion(meta: BuildReferenceMeta): "main" | "next" {
    const release = /^ngspice-(\d+)(?:\.\d+)*$/.exec(meta.toolchainResolution?.ngspiceRef ?? "");
    if (release && Number(release[1]) >= 46) return "next";
    return meta.version === "next" ? "next" : "main";
}

// Both package channels now resolve stable releases. The historical stable
// GF180 sample is kept separately from the development-branch reference.
export function gf180ReferenceVersion(meta: BuildReferenceMeta): "main" | "next" {
    if (/^ngspice-\d+(?:\.\d+)*$/.test(meta.toolchainResolution?.ngspiceRef ?? "")) return "main";
    return meta.version === "next" ? "next" : "main";
}
