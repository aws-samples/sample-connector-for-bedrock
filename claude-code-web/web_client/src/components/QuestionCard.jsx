import { useState } from 'react'
import { HelpCircle, CheckCircle2 } from 'lucide-react'

function QuestionCard({ questions, onSubmitAnswers }) {
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const handleSingleSelect = (questionIndex, optionLabel) => {
    setAnswers({
      ...answers,
      [questionIndex]: optionLabel
    })
  }

  const handleMultiSelect = (questionIndex, optionLabel) => {
    const currentAnswers = answers[questionIndex] || []
    const isSelected = currentAnswers.includes(optionLabel)

    if (isSelected) {
      // Remove from selection
      setAnswers({
        ...answers,
        [questionIndex]: currentAnswers.filter(label => label !== optionLabel)
      })
    } else {
      // Add to selection
      setAnswers({
        ...answers,
        [questionIndex]: [...currentAnswers, optionLabel]
      })
    }
  }

  const handleSubmit = () => {
    // Convert answers to the format expected by backend
    const formattedAnswers = {}
    questions.forEach((question, index) => {
      const answer = answers[index]
      if (answer) {
        // Use question text as key for the answer (matching SDK format)
        if (question.multiSelect) {
          // For multi-select, join with comma
          formattedAnswers[question.question] = Array.isArray(answer) ? answer.join(', ') : answer
        } else {
          formattedAnswers[question.question] = answer
        }
      }
    })

    setSubmitted(true)
    onSubmitAnswers(formattedAnswers, questions)
  }

  const canSubmit = () => {
    // Check if all questions have been answered
    return questions.every((question, index) => {
      const answer = answers[index]
      if (question.multiSelect) {
        return answer && Array.isArray(answer) && answer.length > 0
      } else {
        return answer && answer.length > 0
      }
    })
  }

  if (submitted) {
    return (
      <div className="question-card submitted">
        <div className="question-header">
          <CheckCircle2 size={20} className="icon-success" />
          <span className="question-title">Answers Submitted</span>
        </div>
        <div className="question-content">
          {questions.map((question, qIndex) => (
            <div key={qIndex} className="submitted-answer">
              <div className="submitted-question">{question.question}</div>
              <div className="submitted-value">
                {question.multiSelect
                  ? (answers[qIndex] || []).join(', ')
                  : answers[qIndex]
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="question-card">
      <div className="question-header">
        <HelpCircle size={20} className="icon-question" />
        <span className="question-title">Please Answer the Following Questions</span>
      </div>

      <div className="question-content">
        {questions.map((question, qIndex) => (
          <div key={qIndex} className="question-item">
            <div className="question-text">
              <span className="question-header-tag">{question.header}</span>
              <span className="question-prompt">{question.question}</span>
              {question.multiSelect && (
                <span className="multi-select-hint">(Multiple selections allowed)</span>
              )}
            </div>

            <div className="question-options">
              {question.options.map((option, oIndex) => {
                const isSelected = question.multiSelect
                  ? (answers[qIndex] || []).includes(option.label)
                  : answers[qIndex] === option.label

                return (
                  <div
                    key={oIndex}
                    className={`option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (question.multiSelect) {
                        handleMultiSelect(qIndex, option.label)
                      } else {
                        handleSingleSelect(qIndex, option.label)
                      }
                    }}
                  >
                    <div className="option-checkbox">
                      {question.multiSelect ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                        />
                      ) : (
                        <input
                          type="radio"
                          checked={isSelected}
                          readOnly
                        />
                      )}
                    </div>
                    <div className="option-content">
                      <div className="option-label">{option.label}</div>
                      <div className="option-description">{option.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="question-actions">
        <button
          className="btn-submit-answers"
          onClick={handleSubmit}
          disabled={!canSubmit()}
        >
          Submit Answers
        </button>
      </div>
    </div>
  )
}

export default QuestionCard
