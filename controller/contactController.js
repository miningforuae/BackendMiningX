import Contact from '../model/Contact.js';

// Get all contacts with pagination and filters
export const getAllContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('readBy', 'name email');

    const total = await Contact.countDocuments(query);

    res.status(200).json({
      contacts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error in getAllContacts:', error);
    res.status(500).json({ 
      message: 'Error fetching contacts',
      error: error.message 
    });
  }
};

// Get single contact by ID
export const getContactById = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('readBy', 'name email');
      
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.status(200).json(contact);
  } catch (error) {
    console.error('Error in getContactById:', error);
    res.status(500).json({ 
      message: 'Error fetching contact',
      error: error.message 
    });
  }
};

// Create new contact submission
export const createContact = async (req, res) => {
  try {
    const contact = new Contact(req.body);
    await contact.save();
    
    res.status(201).json({
      message: 'Contact form submitted successfully',
      contact
    });
  } catch (error) {
    console.error('Error in createContact:', error);
    res.status(400).json({ 
      message: 'Error submitting contact form',
      error: error.message 
    });
  }
};

// Mark contact as read
export const markAsRead = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    contact.status = 'read';
    contact.readBy = req.user._id;
    contact.readAt = new Date();
    
    await contact.save();

    res.status(200).json({
      message: 'Contact marked as read',
      contact
    });
  } catch (error) {
    console.error('Error in markAsRead:', error);
    res.status(500).json({ 
      message: 'Error updating contact status',
      error: error.message 
    });
  }
};

// Delete contact
export const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    res.status(200).json({
      message: 'Contact deleted successfully',
      contact
    });
  } catch (error) {
    console.error('Error in deleteContact:', error);
    res.status(500).json({ 
      message: 'Error deleting contact',
      error: error.message 
    });
  }
};

// Get contact statistics
export const getContactStats = async (req, res) => {
  try {
    const stats = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalContacts = await Contact.countDocuments();
    const todayContacts = await Contact.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    });

    res.status(200).json({
      totalContacts,
      todayContacts,
      statusBreakdown: stats
    });
  } catch (error) {
    console.error('Error in getContactStats:', error);
    res.status(500).json({ 
      message: 'Error fetching contact statistics',
      error: error.message 
    });
  }
};