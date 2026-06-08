import styled from 'styled-components'

const Form = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
`

const Input = styled.input`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  color: var(--color-secondary-90, #262f44);
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: #4a90d9;
  }
`

const SelectField = styled.select`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  color: var(--color-secondary-90, #262f44);
  font-size: 14px;
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: #4a90d9;
  }
`

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-secondary-70, #555e72);
  cursor: pointer;
  padding-top: 4px;
`

export default function MetadataForm({ fields, values, onChange }) {
  return (
    <Form>
      {fields.map((field) => (
        <Field key={field.key}>
          <Label>{field.label}{field.required && ' *'}</Label>
          {field.type === 'select' ? (
            <SelectField value={values[field.key] || ''} onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">선택하세요</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </SelectField>
          ) : field.type === 'checkbox' ? (
            <CheckRow>
              <input
                type="checkbox"
                checked={!!values[field.key]}
                onChange={(e) => onChange(field.key, e.target.checked)}
              />
              {field.checkLabel}
            </CheckRow>
          ) : (
            <Input
              type={field.type || 'text'}
              placeholder={field.placeholder}
              value={values[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </Field>
      ))}
    </Form>
  )
}
