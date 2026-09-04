export const TYPE_CAPABILITIES = Object.freeze({
  deploymentElement: "deployment-element",
  deploymentProfile: "deployment-profile",
  deployment: "deployment",
  environment: "environment",
  infrastructure: "infrastructure",
  networkConnection: "network-connection",
} as const);

export const OPERATOR_CAPABILITIES = Object.freeze({
  deploymentUse: "deployment-use",
  deploymentPlacement: "deployment-placement",
  preserveLogicalEdge: "preserve-logical-edge",
} as const);

export const ATTRIBUTE_CAPABILITIES = Object.freeze({
  deploymentActions: "deployment-actions",
  deploymentProfileMembers: "deployment-profile-members",
  placementOwner: "placement-owner",
  infrastructureUses: "infrastructure-uses",
} as const);
