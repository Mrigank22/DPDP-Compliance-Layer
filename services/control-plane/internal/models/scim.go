// services/control-plane/internal/models/scim.go

package models

import "encoding/json"

// SCIM 2.0 schema URNs.
const (
	SCIMUserSchema         = "urn:ietf:params:scim:schemas:core:2.0:User"
	SCIMListResponseSchema = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
	SCIMPatchOpSchema      = "urn:ietf:params:scim:api:messages:2.0:PatchOp"
	SCIMErrorSchema        = "urn:ietf:params:scim:api:messages:2.0:Error"
)

// SCIMName is the SCIM core name sub-attribute.
type SCIMName struct {
	Formatted  string `json:"formatted,omitempty"`
	GivenName  string `json:"givenName,omitempty"`
	FamilyName string `json:"familyName,omitempty"`
}

// SCIMEmail is a SCIM multi-valued email.
type SCIMEmail struct {
	Value   string `json:"value"`
	Primary bool   `json:"primary,omitempty"`
	Type    string `json:"type,omitempty"`
}

// SCIMMeta is the resource metadata block.
type SCIMMeta struct {
	ResourceType string `json:"resourceType"`
	Created      string `json:"created,omitempty"`
	LastModified string `json:"lastModified,omitempty"`
	Location     string `json:"location,omitempty"`
}

// SCIMUser is a SCIM 2.0 core User resource.
type SCIMUser struct {
	Schemas     []string    `json:"schemas"`
	ID          string      `json:"id,omitempty"`
	ExternalID  string      `json:"externalId,omitempty"`
	UserName    string      `json:"userName"`
	Name        *SCIMName   `json:"name,omitempty"`
	DisplayName string      `json:"displayName,omitempty"`
	Emails      []SCIMEmail `json:"emails,omitempty"`
	Active      bool        `json:"active"`
	Meta        *SCIMMeta   `json:"meta,omitempty"`
}

// SCIMListResponse wraps a page of SCIM resources.
type SCIMListResponse struct {
	Schemas      []string    `json:"schemas"`
	TotalResults int         `json:"totalResults"`
	StartIndex   int         `json:"startIndex"`
	ItemsPerPage int         `json:"itemsPerPage"`
	Resources    []*SCIMUser `json:"Resources"`
}

// SCIMPatchOp is a SCIM PATCH request body.
type SCIMPatchOp struct {
	Schemas    []string             `json:"schemas"`
	Operations []SCIMPatchOperation `json:"Operations"`
}

// SCIMPatchOperation is a single PATCH operation.
type SCIMPatchOperation struct {
	Op    string          `json:"op"`
	Path  string          `json:"path,omitempty"`
	Value json.RawMessage `json:"value,omitempty"`
}

// SCIMError is the SCIM error response body.
type SCIMError struct {
	Schemas  []string `json:"schemas"`
	Detail   string   `json:"detail"`
	Status   string   `json:"status"`
	ScimType string   `json:"scimType,omitempty"`
}
