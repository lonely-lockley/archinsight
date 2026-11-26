export const TYPE_CAPABILITIES = Object.freeze({
  documentAggregateRoot: "document-aggregate-root",
  documentAggregateMember: "document-aggregate-member",
  deploymentElement: "deployment-element",
  deploymentEndpoint: "deployment-endpoint",
  deploymentFamily: "deployment-family",
  deploymentProfile: "deployment-profile",
  deployment: "deployment",
  environment: "environment",
  externalElement: "external-element",
  infrastructure: "infrastructure",
  logicalContext: "logical-context",
  networkConnection: "network-connection",
  projection: "deployment-projection",
  route: "deployment-route",
} as const);

export const OPERATOR_CAPABILITIES = Object.freeze({
  deploymentUse: "deployment-use",
  deploymentPlacement: "deployment-placement",
  deploymentRoute: "deployment-route-use",
  preserveLogicalEdge: "preserve-logical-edge",
} as const);

export const ATTRIBUTE_CAPABILITIES = Object.freeze({
  deploymentActions: "deployment-actions",
  deploymentProfileMembers: "deployment-profile-members",
  referenceOnly: "reference-only",
  placementOwner: "placement-owner",
  infrastructureUses: "infrastructure-uses",
} as const);
